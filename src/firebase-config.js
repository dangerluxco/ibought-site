// Public web config (safe to publish; access is controlled by the security
// rules in ibought-app/firestore.rules). Must match ibought-app/firebaseConfig.ts.
export const firebaseConfig = {
  apiKey: 'AIzaSyBrhS6xJ-B5u4W5fXgvn3fGMLjeRI4Huro',
  authDomain: 'ibought-14838.firebaseapp.com',
  projectId: 'ibought-14838',
  storageBucket: 'ibought-14838.firebasestorage.app',
  messagingSenderId: '905945590106',
  appId: '1:905945590106:web:22329c6d7f4c239236eb63',
};

export const accountsEnabled = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
