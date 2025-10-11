import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

function parseServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (!raw) {
    throw new Error('Missing FIREBASE_SERVICE_ACCOUNT environment variable');
  }

  let parsed;
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (error) {
    throw new Error('Invalid FIREBASE_SERVICE_ACCOUNT JSON');
  }

  if (!parsed.private_key || !parsed.client_email || !parsed.project_id) {
    throw new Error('Incomplete Firebase service account configuration');
  }

  return {
    projectId: parsed.project_id,
    clientEmail: parsed.client_email,
    privateKey: parsed.private_key.replace(/\\n/g, '\n')
  };
}

if (!getApps().length) {
  const credentials = parseServiceAccount();

  initializeApp({
    credential: cert({
      projectId: credentials.projectId,
      clientEmail: credentials.clientEmail,
      privateKey: credentials.privateKey
    })
  });
}

const adminAuth = getAuth();

export { adminAuth };
