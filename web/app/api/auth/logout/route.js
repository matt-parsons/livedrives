import { NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME } from '@/lib/authServer';

export const runtime = 'nodejs';

export async function POST() {
  const response = NextResponse.json({ status: 'ok' });

  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: '',
    maxAge: 0,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/'
  });

  return response;
}
