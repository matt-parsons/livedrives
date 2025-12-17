import { NextResponse } from 'next/server';
import { createHighLevelContact as createContact } from '@/lib/highLevel.server';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const payload = await request.json().catch(() => null);

    if (!payload || typeof payload !== 'object') {
      return NextResponse.json({ error: 'Invalid request payload.' }, { status: 400 });
    }

    const result = await createContact(payload);

    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error('HighLevel contact creation failed', error);
    const message = error.message || 'Unable to create HighLevel contact.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
