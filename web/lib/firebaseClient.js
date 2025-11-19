import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
};

if (!firebaseConfig.apiKey || !firebaseConfig.authDomain || !firebaseConfig.projectId) {
  throw new Error('Missing Firebase client configuration');
}

function getFirebaseApp() {
  if (!getApps().length) {
    return initializeApp(firebaseConfig);
  }

  return getApp();
}

const app = getFirebaseApp();
const auth = getAuth(app);

auth.useDeviceLanguage();

export { app, auth };
