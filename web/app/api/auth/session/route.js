import { NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebaseAdmin';

const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const { idToken } = await request.json();

    if (!idToken) {
      return NextResponse.json({ error: 'Missing idToken' }, { status: 400 });
    }

    await adminAuth.verifyIdToken(idToken);
    const sessionCookie = await adminAuth.createSessionCookie(idToken, {
      expiresIn: SESSION_MAX_AGE_MS
    });

    const response = NextResponse.json({ status: 'ok' });
    response.cookies.set({
      name: '__session',
      value: sessionCookie,
      maxAge: SESSION_MAX_AGE_MS / 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/'
    });

    return response;
  } catch (error) {
    console.error('Failed to create session cookie', error);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
