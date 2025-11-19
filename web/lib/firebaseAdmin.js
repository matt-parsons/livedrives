// web/lib/firebaseAdmin.js
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync } from 'fs';
import { join, resolve, isAbsolute } from 'path';

function parseServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT environment variable');

  let parsed;
  try {
    if (raw.endsWith('.json')) {
      const p = isAbsolute(raw) ? raw : join(process.cwd(), raw);
      const fileContent = readFileSync(p, 'utf8');
      parsed = JSON.parse(fileContent);
    } else {
      parsed = JSON.parse(raw);
    }
  } catch (error) {
    throw new Error(`Invalid FIREBASE_SERVICE_ACCOUNT: ${error.message}`);
  }

  if (!parsed.private_key || !parsed.client_email || !parsed.project_id) {
    throw new Error('Incomplete Firebase service account configuration');
  }

  parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
  return parsed;
}

const app = getApps().length
  ? getApps()[0]
  : initializeApp({
      credential: cert(parseServiceAccount()),
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    });

export const adminAuth = getAuth(app);
