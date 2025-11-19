import { NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebaseAdmin';

export const runtime = 'nodejs';

const FIREBASE_API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const FIREBASE_APPLY_OOB_CODE_ENDPOINT = `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${FIREBASE_API_KEY}`;

function normalize(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

async function applyVerifyEmailCode(oobCode) {
  if (!FIREBASE_API_KEY) {
    throw new Error('Missing NEXT_PUBLIC_FIREBASE_API_KEY environment variable.');
  }

  const response = await fetch(FIREBASE_APPLY_OOB_CODE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oobCode })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data?.error?.message || 'Invalid or expired verification code.';
    throw new Error(message);
  }

  if (!data?.email) {
    throw new Error('Verification code did not include an email.');
  }

  return data.email.toLowerCase();
}

export async function POST(request) {
  const payload = await request.json().catch(() => null);

  if (!payload || typeof payload !== 'object') {
    return NextResponse.json({ error: 'Invalid request payload.' }, { status: 400 });
  }

  const email = normalize(payload.email).toLowerCase();
  const password = normalize(payload.password);
  const oobCode = normalize(payload.oobCode);

  if (!oobCode) {
    return NextResponse.json({ error: 'A verification code is required to set your password.' }, { status: 400 });
  }

  if (!email) {
    return NextResponse.json({ error: 'An email address is required.' }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
  }

  try {
    const verifiedEmail = await applyVerifyEmailCode(oobCode);

    if (verifiedEmail !== email) {
      return NextResponse.json({ error: 'Verification code does not match this email address.' }, { status: 400 });
    }

    const userRecord = await adminAuth.getUserByEmail(email);

    if (!userRecord.emailVerified) {
      return NextResponse.json({ error: 'Please verify your email before setting a password.' }, { status: 400 });
    }

    await adminAuth.updateUser(userRecord.uid, { password });

    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error('Failed to set password after verification', error);
    return NextResponse.json(
      { error: 'Unable to complete password setup. Please request a new verification link.' },
      { status: 500 }
    );
  }
}
