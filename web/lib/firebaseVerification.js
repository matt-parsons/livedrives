import { adminAuth } from '@/lib/firebaseAdmin';

const FIREBASE_API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

if (!FIREBASE_API_KEY) {
  throw new Error('Missing NEXT_PUBLIC_FIREBASE_API_KEY environment variable');
}

async function exchangeCustomTokenForIdToken(uid) {
  const customToken = await adminAuth.createCustomToken(uid);

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true })
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data?.error?.message || 'Failed to exchange Firebase custom token.';
    throw new Error(message);
  }

  if (!data?.idToken) {
    throw new Error('Firebase custom token exchange did not return an ID token.');
  }

  return data.idToken;
}

async function triggerVerificationEmail(idToken) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestType: 'VERIFY_EMAIL', idToken })
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data?.error?.message || 'Failed to trigger Firebase email verification.';
    throw new Error(message);
  }
}

export async function sendFirebaseVerificationEmail(uid) {
  if (!uid) {
    throw new Error('A Firebase UID is required to send a verification email.');
  }

  const idToken = await exchangeCustomTokenForIdToken(uid);
  await triggerVerificationEmail(idToken);
}
