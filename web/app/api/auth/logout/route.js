import { NextResponse } from 'next/server';
import { applyLogoutCookies } from '@/lib/logout';

export const runtime = 'nodejs';

export async function POST(request) {
  const hostname = request?.nextUrl?.hostname ?? new URL(request.url).hostname;

  return applyLogoutCookies(NextResponse.json({ status: 'ok' }), { hostname });
}
