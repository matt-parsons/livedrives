import { SESSION_COOKIE_NAME } from '@/lib/authServer';
import { ROLE_PREVIEW_COOKIE_NAME } from '@/lib/rolePreview';

export function applyLogoutCookies(response) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: '',
    maxAge: 0,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/'
  });

  response.cookies.set({
    name: ROLE_PREVIEW_COOKIE_NAME,
    value: '',
    maxAge: 0,
    httpOnly: true,
    sameSite: 'lax',
    path: '/'
  });

  return response;
}
