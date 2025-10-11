import { cookies } from 'next/headers';
import { toErrorResponse } from '@/lib/authServer';

export async function POST() {
  try {
    cookies().set({
      name: '__session',
      value: '',
      path: '/',
      maxAge: 0,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });

    return Response.json({ success: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
