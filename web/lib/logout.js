import { applySessionCookie, getCookieDomain } from '@/lib/authServer';
import { ROLE_PREVIEW_COOKIE_NAME } from '@/lib/rolePreview';

export function applyLogoutCookies(response, { hostname } = {}) {
  const domain = getCookieDomain(hostname);

  applySessionCookie(response, '', { hostname, domain, maxAgeMs: 0 });

  response.cookies.set({
    name: ROLE_PREVIEW_COOKIE_NAME,
    value: '',
    maxAge: 0,
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    ...(domain ? { domain } : {})
  });

  return response;
}
