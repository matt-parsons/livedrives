'use client';

import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
};

function createFirebaseApp() {
  if (!firebaseConfig.apiKey || !firebaseConfig.authDomain || !firebaseConfig.projectId) {
    throw new Error('Firebase client configuration is incomplete.');
  }

  if (!getApps().length) {
    initializeApp(firebaseConfig);
  }

  return getApp();
}

export function getFirebaseApp() {
  return createFirebaseApp();
}

export function getFirebaseAuth() {
  return getAuth(getFirebaseApp());
}
