import pool from '@lib/db/db.js';
import { AuthError, requireAuth } from '@/lib/authServer';
import { ensureGbpAccessToken } from '@/lib/googleBusinessProfile';
import { buildOrganizationScopeClause } from '@/lib/organizations';
import { BUSINESS_FIELDS } from '@/app/dashboard/[business]/helpers';
import { loadReviewSnapshot } from '@/app/dashboard/[business]/reviews/reviewSnapshot';

export const runtime = 'nodejs';

async function loadScopedBusiness(session, businessId) {
  const scope = buildOrganizationScopeClause(session);
  const [rows] = await pool.query(
    `SELECT ${BUSINESS_FIELDS}
       FROM businesses
      WHERE id = ?
        AND ${scope.clause}
      LIMIT 1`,
    [businessId, ...scope.params]
  );

  return rows[0] ?? null;
}

export async function GET(request, { params }) {
  const businessId = Number(params?.businessId);

  if (!Number.isFinite(businessId) || businessId <= 0) {
    return Response.json({ error: 'Invalid business identifier.' }, { status: 400 });
  }

  try {
    const session = await requireAuth(request);
    const business = await loadScopedBusiness(session, businessId);

    if (!business) {
      return Response.json({ error: 'Business not found.' }, { status: 404 });
    }

    const gbpAccessToken = await ensureGbpAccessToken(business.id);
    const { snapshot, dataForSeoPending } = await loadReviewSnapshot(business, gbpAccessToken, {
      skipRemoteFetch: true
    });

    return Response.json({ snapshot, dataForSeoPending });
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }

    console.error(`Failed to fetch review snapshot for business ${params?.businessId}`, error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
