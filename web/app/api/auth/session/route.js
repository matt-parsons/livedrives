import { NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebaseAdmin';
import { applySessionCookie, SESSION_MAX_AGE_MS } from '@/lib/authServer';
import { trackUserLogin } from '@/lib/loginTracking';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const { idToken } = await request.json();

    if (!idToken) {
      return NextResponse.json({ error: 'Missing idToken' }, { status: 400 });
    }

    const decoded = await adminAuth.verifyIdToken(idToken);
    const sessionCookie = await adminAuth.createSessionCookie(idToken, {
      expiresIn: SESSION_MAX_AGE_MS
    });

    try {
      await trackUserLogin({ firebaseUid: decoded.uid });
    } catch (error) {
      console.error('Failed to track login activity', error);
    }

    return applySessionCookie(NextResponse.json({ status: 'ok' }), sessionCookie, {
      hostname: request?.nextUrl?.hostname ?? new URL(request.url).hostname,
      maxAgeMs: SESSION_MAX_AGE_MS
    });
  } catch (error) {
    console.error('Failed to create session cookie', error);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
