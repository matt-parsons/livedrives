import { NextResponse } from 'next/server';
import { AuthError, requireAuth } from '@/lib/authServer';
import { loadOptimizationData } from '@/lib/optimizationData';

export const runtime = 'nodejs';

function parseBusinessId(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const placeId = searchParams.get('placeId');
  const businessId = parseBusinessId(searchParams.get('businessId'));

  if (!placeId) {
    return NextResponse.json(
      { error: 'Missing placeId parameter.' },
      { status: 400 }
    );
  }

  try {
    const data = await loadOptimizationData(placeId, { businessId });
    return NextResponse.json({ data });
  } catch (error) {
    const message =
      error?.message && typeof error.message === 'string'
        ? error.message
        : 'Failed to load optimization data.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function POST(request) {
  let payload = {};
  try {
    payload = await request.json();
  } catch {
    payload = {};
  }

  const placeId = payload?.placeId ?? null;
  const businessId = parseBusinessId(payload?.businessId);

  if (!placeId) {
    return NextResponse.json({ error: 'Missing placeId parameter.' }, { status: 400 });
  }

  let session;
  try {
    session = await requireAuth(request);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    throw error;
  }

  try {
    const data = await loadOptimizationData(placeId, {
      businessId,
      forceRefresh: true,
      manualTrigger: true,
      manualRefreshCooldownBypass: session.role === 'owner'
    });
    return NextResponse.json({ data });
  } catch (error) {
    const responsePayload = {
      error:
        error?.message && typeof error.message === 'string'
          ? error.message
          : 'Failed to refresh optimization data.'
    };

    if (error?.code === 'MANUAL_REFRESH_THROTTLED') {
      responsePayload.code = error.code;
      responsePayload.nextAllowedAt = error.nextAllowedAt?.toISOString?.() ?? null;
      return NextResponse.json(responsePayload, { status: 429 });
    }

    return NextResponse.json(responsePayload, { status: 502 });
  }
}
