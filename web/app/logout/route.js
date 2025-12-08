import { NextResponse } from 'next/server';
import { applyLogoutCookies } from '@/lib/logout';

export const runtime = 'nodejs';

export function GET(request) {
  const nextUrl = request?.nextUrl;
  const redirectParam = nextUrl?.searchParams?.get('redirect');
  const destination = typeof redirectParam === 'string' && redirectParam.startsWith('/')
    ? redirectParam
    : '/';

  const targetUrl = nextUrl ? new URL(destination, nextUrl.origin) : destination;

  return applyLogoutCookies(NextResponse.redirect(targetUrl), {
    hostname: nextUrl?.hostname ?? new URL(request.url).hostname
  });
}
