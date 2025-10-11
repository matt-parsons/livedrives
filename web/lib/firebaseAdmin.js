import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

let cachedApp;

function getServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (parsed.private_key) {
      parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
    }
    return parsed;
  } catch (error) {
    console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT:', error);
    throw error;
  }
}

export function getFirebaseAdminApp() {
  if (cachedApp) {
    return cachedApp;
  }

  if (getApps().length) {
    cachedApp = getApps()[0];
    return cachedApp;
  }

  const serviceAccount = getServiceAccount();
  if (serviceAccount) {
    cachedApp = initializeApp({
      credential: cert(serviceAccount),
    });
  } else {
    cachedApp = initializeApp();
  }

  return cachedApp;
}

export function getFirebaseAdminAuth() {
  return getAuth(getFirebaseAdminApp());
}
