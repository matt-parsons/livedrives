import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/authServer';
import { readCtrPauseState, writeCtrPauseState } from '@lib/utils/ctrPause';

export async function GET(request) {
  const session = await requireAuth(request);

  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const state = await readCtrPauseState();
  return NextResponse.json(state);
}

export async function POST(request) {
  const session = await requireAuth(request);

  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let payload;
  try {
    payload = await request.json();
  } catch (error) {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  if (typeof payload?.paused !== 'boolean') {
    return NextResponse.json({ error: 'Field "paused" must be a boolean' }, { status: 400 });
  }

  const state = await writeCtrPauseState(payload.paused);
  return NextResponse.json(state);
}
