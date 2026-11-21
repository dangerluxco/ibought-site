// GENERATED from ibought-app/utils/amazon.ts by scripts/sync-lib.js. Do not edit.
// Pure helpers for Amazon links, dates and images. No React Native imports:
// scripts/test-parsers.js runs this file under Node.
const ASIN_IN_URL = /\/(?:dp|gp\/product|gp\/aw\/d|product)\/([A-Z0-9]{10})(?:[/?#]|$)/i;
export function asinFromUrl(url) {
    const m = url.match(ASIN_IN_URL);
    return m ? m[1].toUpperCase() : null;
}
/** First http(s) link in a blob of pasted or shared text. */
export function firstUrl(text) {
    const m = text.match(/https?:\/\/[^\s]+/i);
    return m ? m[0].replace(/[).,]+$/, '') : null;
}
/** The product on Amazon, for the user's OWN viewing. Never carries a tag. */
export function productUrlFor(asin) {
    return `https://www.amazon.com/dp/${asin}`;
}
/**
 * THE one place the outgoing link is built: our recommendation page,
 * ibought.online/r/#<ASIN>/<name-with-hyphens>. The page (repo ibought-site,
 * r/index.html) reads the part after # in the friend's browser and shows the
 * "View on Amazon" button; any affiliate tag lives there, never in the app.
 * An optional third part is the Amazon image id, so the page can show the
 * picture: .../r/#<ASIN>/<name>/<imageId>.
 */
export function shareUrlFor(asin, title, image) {
    const slug = shortTitle(title)
        .replace(/[^A-Za-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60);
    const imageId = amazonImageId(image);
    if (imageId)
        return `https://ibought.online/r/#${asin}/${slug || '-'}/${imageId}`;
    return `https://ibought.online/r/#${asin}${slug ? `/${slug}` : ''}`;
}
/** "https://m.media-amazon.com/images/I/71abc._SL500_.jpg" → "71abc". */
export function amazonImageId(url) {
    if (!url)
        return null;
    // Amazon serves the same pictures from two hosts, and writes "+" as "%2B".
    // Matched on the path alone: the page rebuilds the address on Amazon's
    // image host itself, so the original host does not matter.
    const m = url.match(/\/images\/I\/([A-Za-z0-9+_%-]{6,30})(?:\.|$)/);
    if (!m)
        return null;
    const id = m[1].replace(/%2B/gi, '+');
    return /^[A-Za-z0-9+_-]{6,24}$/.test(id) ? id : null;
}
const MONTHS = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december',
];
/** "November 3, 2026" or an ISO timestamp → "2026-11-03". Null when unreadable. */
export function toIsoDate(raw) {
    if (!raw)
        return null;
    const s = raw.trim();
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso)
        return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (us)
        return `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
    const long = s.match(/([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/);
    if (long) {
        const m = MONTHS.indexOf(long[1].toLowerCase());
        if (m >= 0)
            return `${long[3]}-${String(m + 1).padStart(2, '0')}-${long[2].padStart(2, '0')}`;
    }
    return null;
}
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function prettyDate(iso) {
    if (!iso)
        return '';
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m)
        return '';
    return `${SHORT_MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
}
/** Amazon thumbnails carry a size token (._SS142_.); ask for a larger one. */
export function largerImage(url) {
    if (!url)
        return null;
    if (!/media-amazon\.com|ssl-images-amazon\.com/.test(url))
        return url;
    return url.replace(/\._[A-Za-z0-9_,]+_\./, '._SL500_.');
}
/**
 * Amazon titles are stuffed with keywords. For the message a friend reads, keep
 * the part before the first separator: "8 in 1 Smart Fried Egg Cooker, Egg
 * Maker, Nonstick, ..." becomes "8 in 1 Smart Fried Egg Cooker".
 */
export function shortTitle(title) {
    const t = title.replace(/\s+/g, ' ').trim();
    if (t.length <= 60)
        return t;
    let cut = -1;
    for (const sep of [' | ', ' , ', ', ', ' - ', ' – ', ' — ', ' (', ': ']) {
        const i = t.indexOf(sep);
        if (i >= 15 && (cut < 0 || i < cut))
            cut = i;
    }
    if (cut > 0 && cut <= 80)
        return t.slice(0, cut).trim();
    const head = t.slice(0, 60);
    const space = head.lastIndexOf(' ');
    return (space > 30 ? head.slice(0, space) : head).trim() + '…';
}
