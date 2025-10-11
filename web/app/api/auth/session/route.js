import { cookies } from 'next/headers';
import { getFirebaseAdminAuth } from '@/lib/firebaseAdmin';
import { UnauthorizedError, toErrorResponse } from '@/lib/authServer';

const SEVEN_DAYS_SECONDS = 60 * 60 * 24 * 7;

export async function POST(request) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      throw new UnauthorizedError('Missing idToken');
    }

    const { idToken } = body ?? {};
    if (!idToken) {
      throw new UnauthorizedError('Missing idToken');
    }

    const auth = getFirebaseAdminAuth();
    await auth.verifyIdToken(idToken);
    const sessionCookie = await auth.createSessionCookie(idToken, {
      expiresIn: SEVEN_DAYS_SECONDS * 1000,
    });

    cookies().set({
      name: '__session',
      value: sessionCookie,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: SEVEN_DAYS_SECONDS,
      path: '/',
    });

    return Response.json({ success: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
