// Public web config (safe to publish; access is controlled by the security
// rules in ibought-app/firestore.rules). Must match ibought-app/firebaseConfig.ts.
export const firebaseConfig = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
};

export const accountsEnabled = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
