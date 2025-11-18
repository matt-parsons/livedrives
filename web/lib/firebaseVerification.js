import { adminAuth } from '@/lib/firebaseAdmin';

const FIREBASE_API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

if (!FIREBASE_API_KEY) {
  throw new Error('Missing NEXT_PUBLIC_FIREBASE_API_KEY environment variable');
}

const FIREBASE_SEND_OOB_ENDPOINT = `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${FIREBASE_API_KEY}`;

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

async function sendOobCode(payload) {
  const response = await fetch(FIREBASE_SEND_OOB_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data?.error?.message || 'Failed to trigger Firebase action email.';
    throw new Error(message);
  }
}

async function triggerVerificationEmail(idToken, email) {
  await sendOobCode({ requestType: 'VERIFY_EMAIL', idToken, email });
}

async function triggerPasswordResetEmail(email) {
  await sendOobCode({ requestType: 'PASSWORD_RESET', email });
}

export async function sendFirebaseVerificationEmail(uid, email) {
  if (!uid) {
    throw new Error('A Firebase UID is required to send a verification email.');
  }

  const idToken = await exchangeCustomTokenForIdToken(uid);
  await triggerVerificationEmail(idToken, email);
}

export async function sendFirebasePasswordResetEmail(email) {
  if (!email || !email.trim()) {
    throw new Error('An email address is required to send a password reset link.');
  }

  await triggerPasswordResetEmail(email.trim().toLowerCase());
}
