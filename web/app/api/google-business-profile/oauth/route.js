import { NextResponse } from 'next/server';
import pool from '@lib/db/db.js';
import { requireAuth } from '@/lib/authServer';
import { buildOrganizationScopeClause } from '@/lib/organizations';
import { exchangeGbpAuthorizationCode } from '@/lib/googleBusinessProfile';

export const runtime = 'nodejs';

function parseBusinessState(state) {
  if (!state || typeof state !== 'string') {
    return null;
  }

  const [entity, identifier] = state.split(':', 2);
  if (entity !== 'business') {
    return null;
  }

  const numericId = Number(identifier);
  return Number.isFinite(numericId) && numericId > 0 ? numericId : null;
}

async function loadAuthorizedBusiness(session, businessId) {
  const scope = buildOrganizationScopeClause(session);
  const [rows] = await pool.query(
    `SELECT id,
            business_slug AS businessSlug
       FROM businesses
      WHERE id = ?
        AND ${scope.clause}
      LIMIT 1`,
    [businessId, ...scope.params]
  );

  return rows[0] ?? null;
}

function buildReviewRedirect(request, businessSlug, status) {
  const url = new URL(request.url);
  url.pathname = businessSlug ? `/dashboard/${businessSlug}/reviews` : '/dashboard';
  url.searchParams.delete('code');
  url.searchParams.delete('state');
  url.searchParams.delete('error');

  if (status) {
    url.searchParams.set('gbpAuth', status);
  }

  return NextResponse.redirect(url);
}

export async function GET(request) {
  try {
    const session = await requireAuth(request);
    const params = new URL(request.url).searchParams;

    if (params.get('error')) {
      return buildReviewRedirect(request, null, 'error');
    }

    const code = params.get('code');
    const businessId = parseBusinessState(params.get('state'));

    if (!businessId) {
      return buildReviewRedirect(request, null, 'error');
    }

    const business = await loadAuthorizedBusiness(session, businessId);
    if (!business) {
      return buildReviewRedirect(request, null, 'error');
    }

    if (!code) {
      return buildReviewRedirect(request, business.businessSlug, 'error');
    }

    await exchangeGbpAuthorizationCode(businessId, code);

    return buildReviewRedirect(request, business.businessSlug, 'success');
  } catch (error) {
    console.error('Failed to handle GBP OAuth callback', error);
    return buildReviewRedirect(request, null, 'error');
  }
}
