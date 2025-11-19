import { NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebaseAdmin';

export const runtime = 'nodejs';

function normalize(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
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
