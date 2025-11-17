import { NextResponse } from 'next/server';
import { applyLogoutCookies } from '@/lib/logout';

export const runtime = 'nodejs';

export async function POST() {
  return applyLogoutCookies(NextResponse.json({ status: 'ok' }));
}
