// iBought web app (ibought.online/app). Same account and same data as the
// iPhone app's optional sync:
//   users/{uid}/purchases/{id}  Purchase fields + updatedAt (ms) + deleted
// Every write sets updatedAt = now; the newer edit wins on every device.
// A removed item stays as a { deleted: true } marker so phones drop it too.
// Bundled by `npm run build` into app/app.js (committed).
import { initializeApp } from 'firebase/app';
import {
  EmailAuthProvider,
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { collection, doc, getDocs, getFirestore, onSnapshot, setDoc, writeBatch } from 'firebase/firestore';

import { accountsEnabled, firebaseConfig } from './firebase-config.js';
import { asinFromUrl, firstUrl, prettyDate, productUrlFor, shareUrlFor, shortTitle } from './generated/amazon.js';
import { parseOrderHistoryCsv } from './generated/csv.js';

// Dan's wording; must match SHARE_LEAD in ibought-app/services/share.ts.
const SHARE_LEAD = 'Check out what iBought Online! I highly recommend it:';
const BATCH = 400;

const $ = (id) => document.getElementById(id);
const show = (el, on = true) => { el.hidden = !on; };
function say(el, text) { el.textContent = text || ''; show(el, !!text); }

function friendlyAuthError(e) {
  switch (e && e.code) {
    case 'auth/invalid-email': return 'That email address does not look right.';
    case 'auth/email-already-in-use': return 'There is already an account with that email. Sign in instead.';
    case 'auth/weak-password': return 'Use a password with at least 6 characters.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found': return 'Email or password is incorrect.';
    case 'auth/too-many-requests': return 'Too many attempts. Wait a few minutes and try again.';
    case 'auth/network-request-failed': return 'No connection. Check your internet and try again.';
    default: return 'Something went wrong. Please try again.';
  }
}

export function shareText(p) {
  const note = (p.note || '').trim() ? `\n${p.note.trim()}` : '';
  const link = p.asin ? `\n${shareUrlFor(p.asin, p.title, p.image)}` : '';
  return `${SHARE_LEAD}\n\n${shortTitle(p.title)}${note}${link}`;
}

if (!accountsEnabled) {
  show($('loading'), false);
  show($('unavailable'));
} else {
  start();
}

function start() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  let user = null;
  let items = new Map(); // id -> purchase (deleted ones left out)
  let unsubscribe = null;
  let filter = 'all';
  let openId = null;
  let mode = 'signin';

  const col = () => collection(db, 'users', user.uid, 'purchases');
  const ref = (id) => doc(db, 'users', user.uid, 'purchases', id);
  const save = (id, change) => setDoc(ref(id), { ...change, id, updatedAt: Date.now() }, { merge: true });

  // ---------------------------------------------------------------- auth UI
  document.querySelectorAll('.tab').forEach((t) =>
    t.addEventListener('click', () => {
      mode = t.dataset.mode;
      document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('on', x === t));
      $('auth-submit').textContent = mode === 'create' ? 'Create account' : 'Sign in';
      $('password').autocomplete = mode === 'create' ? 'new-password' : 'current-password';
      show($('forgot'), mode === 'signin');
      say($('auth-error'), ''); say($('auth-notice'), '');
    }),
  );

  $('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    say($('auth-error'), ''); say($('auth-notice'), '');
    $('auth-submit').disabled = true;
    try {
      const email = $('email').value.trim();
      if (mode === 'create') await createUserWithEmailAndPassword(auth, email, $('password').value);
      else await signInWithEmailAndPassword(auth, email, $('password').value);
      $('password').value = '';
    } catch (err) {
      say($('auth-error'), friendlyAuthError(err));
    } finally {
      $('auth-submit').disabled = false;
    }
  });

  $('forgot').addEventListener('click', async () => {
    say($('auth-error'), ''); say($('auth-notice'), '');
    const email = $('email').value.trim();
    if (!email) return say($('auth-error'), 'Enter your email first, then choose “Forgot password”.');
    try {
      await sendPasswordResetEmail(auth, email);
      say($('auth-notice'), 'Check your email for a link to set a new password.');
    } catch (err) {
      say($('auth-error'), friendlyAuthError(err));
    }
  });

  $('signout').addEventListener('click', () => signOut(auth));

  onAuthStateChanged(auth, (u) => {
    user = u;
    show($('loading'), false);
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    items = new Map();
    show($('auth'), !u);
    show($('list-view'), !!u);
    show($('signout'), !!u);
    show($('account-open'), !!u);
    say($('who'), u ? u.email : '');
    if (!u) return;
    setDoc(doc(db, 'users', u.uid), { email: u.email || null }, { merge: true }).catch(() => {});
    listen();
  });

  // The live list. If the connection or permission check fails (it can for a
  // moment right after an account is created), try again instead of going dead.
  function listen() {
    if (!user) return;
    const uid = user.uid;
    unsubscribe = onSnapshot(
      col(),
      (snap) => {
        items = new Map();
        snap.forEach((d) => {
          const p = d.data();
          if (!p.deleted && p.title) items.set(d.id, { ...p, id: d.id });
        });
        render();
        if (openId) (items.has(openId) ? fillItem(false) : $('item').close());
      },
      () => {
        $('count').textContent = 'Reconnecting…';
        setTimeout(() => { if (user && user.uid === uid) listen(); }, 3000);
      },
    );
  }

  // ------------------------------------------------------------------- list
  function visible() {
    const q = $('search').value.trim().toLowerCase();
    let list = [...items.values()];
    if (filter === 'shared') list = list.filter((p) => (p.sharedCount || 0) > 0);
    if (q) list = list.filter((p) => p.title.toLowerCase().includes(q));
    if (filter === 'shared') list.sort((a, b) => (b.lastSharedAt || 0) - (a.lastSharedAt || 0));
    else list.sort((a, b) => (b.orderDate || '').localeCompare(a.orderDate || '') || (b.addedAt || 0) - (a.addedAt || 0));
    return list;
  }

  function rowFor(p) {
    // A div, not a <button>: buttons lay out flex children unreliably.
    const row = document.createElement('div');
    row.className = 'row';
    row.tabIndex = 0;
    row.setAttribute('role', 'button');
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openItem(p.id); }
    });
    let thumb;
    if (p.image) {
      thumb = document.createElement('img');
      thumb.className = 'thumb';
      thumb.loading = 'lazy';
      thumb.alt = '';
      thumb.src = p.image;
    } else {
      thumb = document.createElement('div');
      thumb.className = 'thumb blank';
      thumb.textContent = '□';
    }
    const body = document.createElement('div');
    body.className = 'row-text';
    const title = document.createElement('b');
    title.textContent = p.title;
    const meta = document.createElement('small');
    meta.textContent = [
      p.orderDate ? `Bought ${prettyDate(p.orderDate)}` : null,
      p.sharedCount ? `Shared ${p.sharedCount}×` : null,
    ].filter(Boolean).join(' · ');
    body.append(title, meta);
    row.append(thumb, body);
    row.addEventListener('click', () => openItem(p.id));
    return row;
  }

  function render() {
    dropAutofill();
    const list = visible();
    const rows = $('rows');
    rows.replaceChildren(...list.slice(0, 400).map(rowFor));
    show($('empty'), items.size === 0);
    const total = items.size;
    $('count').textContent = total
      ? list.length > 400
        ? `Showing 400 of ${list.length}. Search to narrow it down.`
        : `${list.length} of ${total} purchase${total === 1 ? '' : 's'}`
      : '';
    $('search').placeholder = `Search ${total} purchase${total === 1 ? '' : 's'}`;
  }

  // Password managers like to drop the account email into the search box,
  // which filters the list down to nothing. The box stays read-only until it
  // is actually clicked, and an autofilled email is thrown away.
  const search = $('search');
  search.addEventListener('focus', () => search.removeAttribute('readonly'));
  search.addEventListener('pointerdown', () => search.removeAttribute('readonly'));
  function dropAutofill() {
    if (user && search.value && search.value.trim().toLowerCase() === (user.email || '').toLowerCase()) {
      search.value = '';
      return true;
    }
    return false;
  }
  search.addEventListener('input', () => { dropAutofill(); render(); });
  search.addEventListener('change', () => { if (dropAutofill()) render(); });
  setInterval(() => { if (dropAutofill()) render(); }, 1500);
  document.querySelectorAll('.chip').forEach((c) =>
    c.addEventListener('click', () => {
      filter = c.dataset.filter;
      document.querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x === c));
      render();
    }),
  );

  // ------------------------------------------------------------------- item
  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
  $('item').addEventListener('close', () => { openId = null; });

  function current() {
    const p = items.get(openId);
    return p ? { ...p, note: $('item-note').value } : null;
  }

  function fillItem(resetNote) {
    const p = items.get(openId);
    if (!p) return;
    $('item-title').textContent = p.title;
    $('item-date').textContent = p.orderDate ? `Bought ${prettyDate(p.orderDate)}` : '';
    const img = $('item-img');
    if (p.image) { img.src = p.image; img.alt = p.title; show(img); } else show(img, false);
    if (resetNote) $('item-note').value = p.note || '';
    const text = shareText(current());
    $('item-preview').textContent = text;
    $('item-email').href = `mailto:?subject=${encodeURIComponent(shortTitle(p.title))}&body=${encodeURIComponent(text)}`;
    $('item-text').href = `sms:?&body=${encodeURIComponent(text)}`;
    show($('item-copylink'), !!p.asin);
    show($('item-product'), !!p.asin);
    if (p.asin) $('item-product').href = productUrlFor(p.asin);
    show($('item-share'), typeof navigator.share === 'function');
  }

  function openItem(id) {
    openId = id;
    say($('item-notice'), '');
    fillItem(true);
    $('item').showModal();
  }

  let noteTimer = null;
  $('item-note').addEventListener('input', () => {
    fillItem(false);
    const id = openId;
    const note = $('item-note').value;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => save(id, { note }).catch(() => {}), 700);
  });

  async function recordShare() {
    const p = items.get(openId);
    if (!p) return;
    await save(p.id, { note: $('item-note').value, sharedCount: (p.sharedCount || 0) + 1, lastSharedAt: Date.now() });
  }

  $('item-copy').addEventListener('click', async () => {
    await navigator.clipboard.writeText(shareText(current()));
    say($('item-notice'), 'Message copied. Paste it wherever you like.');
    recordShare().catch(() => {});
  });
  $('item-copylink').addEventListener('click', async () => {
    const p = current();
    await navigator.clipboard.writeText(shareUrlFor(p.asin, p.title, p.image));
    say($('item-notice'), 'Link copied.');
  });
  $('item-share').addEventListener('click', async () => {
    try {
      await navigator.share({ text: shareText(current()) });
      recordShare().catch(() => {});
    } catch { /* closed without sharing */ }
  });
  $('item-email').addEventListener('click', () => recordShare().catch(() => {}));
  $('item-text').addEventListener('click', () => recordShare().catch(() => {}));

  $('item-remove').addEventListener('click', async () => {
    if (!confirm('Remove this purchase from your list? Nothing changes on Amazon.')) return;
    const id = openId;
    $('item').close();
    await setDoc(ref(id), { id, deleted: true, updatedAt: Date.now() }, { merge: true });
  });

  // -------------------------------------------------------------------- add
  $('add-open').addEventListener('click', () => {
    say($('add-error'), ''); say($('add-notice'), '');
    $('add').showModal();
  });

  function newItem(asin, title, orderDate, source) {
    const now = Date.now();
    return {
      id: asin, asin, title, image: null, orderDate: orderDate || null, source,
      note: '', sharedCount: 0, lastSharedAt: null, addedAt: now, updatedAt: now, deleted: false,
    };
  }

  $('add-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    say($('add-error'), ''); say($('add-notice'), '');
    const title = $('add-title').value.trim();
    const url = firstUrl($('add-link').value);
    const asin = url ? asinFromUrl(url) : null;
    if (!title) return say($('add-error'), 'Give it a name so you can find it later.');
    if (!asin) {
      return say($('add-error'), 'Use the full product link from Amazon’s address bar (it contains /dp/ and a 10-character code). Short a.co links only work in the iPhone app.');
    }
    const existing = items.get(asin);
    if (existing) await save(asin, { title });
    else await setDoc(ref(asin), newItem(asin, title, null, 'manual'));
    $('add-link').value = ''; $('add-title').value = '';
    say($('add-notice'), existing ? 'That item was already in your list; its name is updated.' : 'Added to your purchases.');
  });

  $('add-file').addEventListener('change', async () => {
    say($('add-error'), ''); say($('add-notice'), '');
    const file = $('add-file').files[0];
    if (!file) return;
    const { items: parsed, error } = parseOrderHistoryCsv(await file.text());
    $('add-file').value = '';
    if (error) return say($('add-error'), error);
    const fresh = parsed.filter((it) => !items.has(it.asin));
    for (let i = 0; i < fresh.length; i += BATCH) {
      const batch = writeBatch(db);
      fresh.slice(i, i + BATCH).forEach((it) => batch.set(ref(it.asin), newItem(it.asin, it.title, it.orderDate, 'file')));
      await batch.commit();
    }
    say($('add-notice'), `${fresh.length} new purchase${fresh.length === 1 ? '' : 's'} added (${parsed.length - fresh.length} already in your list).`);
  });

  // ---------------------------------------------------------------- account
  $('account-open').addEventListener('click', () => {
    $('account-email').textContent = `Signed in as ${user.email}`;
    say($('account-error'), '');
    $('delete-password').value = '';
    $('account').showModal();
  });

  $('wipe').addEventListener('click', async () => {
    if (!confirm(`Delete all ${items.size} purchases, notes and share counts from your account and your signed-in phones? This cannot be undone.`)) return;
    const ids = [...items.keys()];
    const now = Date.now();
    for (let i = 0; i < ids.length; i += BATCH) {
      const batch = writeBatch(db);
      ids.slice(i, i + BATCH).forEach((id) => batch.set(ref(id), { id, deleted: true, updatedAt: now }, { merge: true }));
      await batch.commit();
    }
    $('account').close();
  });

  $('delete-account').addEventListener('click', async () => {
    say($('account-error'), '');
    const password = $('delete-password').value;
    if (!password) return say($('account-error'), 'Enter your password to confirm.');
    if (!confirm('Permanently delete your iBought account and everything stored in it? This cannot be undone.')) return;
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
      if (unsubscribe) { unsubscribe(); unsubscribe = null; }
      const uid = user.uid;
      const snap = await getDocs(collection(db, 'users', uid, 'purchases'));
      for (let i = 0; i < snap.docs.length; i += BATCH) {
        const batch = writeBatch(db);
        snap.docs.slice(i, i + BATCH).forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
      const last = writeBatch(db);
      last.delete(doc(db, 'users', uid));
      await last.commit();
      await deleteUser(user);
      $('account').close();
    } catch (err) {
      say($('account-error'), friendlyAuthError(err));
    }
  });
}
