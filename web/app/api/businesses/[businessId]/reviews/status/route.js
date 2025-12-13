import pool from '@lib/db/db.js';
import { AuthError, requireAuth } from '@/lib/authServer';
import { buildOrganizationScopeClause } from '@/lib/organizations';
import { BUSINESS_FIELDS } from '@/app/dashboard/[business]/helpers';
import { loadReviewFetchTask } from '@lib/db/reviewFetchTasks';
import { fetchDataForSeoReviewsByTaskId } from '@lib/google/dataForSeoReviews.js';

export const runtime = 'nodejs';

function resolveAuthHeader(options = {}) {
  const base64Token = options.authToken || process.env.DATAFORSEO_AUTH;
  const username = options.username || process.env.DATAFORSEO_USERNAME;
  const password = options.password || process.env.DATAFORSEO_PASSWORD;

  const token = base64Token || (username && password
    ? Buffer.from(`${username}:${password}`).toString('base64')
    : null);

  if (!token) {
    throw new Error('DataForSEO credentials are not configured.');
  }

  return `Basic ${token}`;
}

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

    const task = await loadReviewFetchTask(businessId);
    const taskId = task?.taskId ?? null;

    if (!taskId || task?.status !== 'pending') {
      return Response.json({ isComplete: true, taskId });
    }

    const headers = {
      Authorization: resolveAuthHeader(),
      'Content-Type': 'application/json',
    };

    const reviews = await fetchDataForSeoReviewsByTaskId(taskId, headers);
    const isComplete = Array.isArray(reviews) && reviews.length > 0;

    return Response.json({ isComplete, taskId });
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }

    console.error(`Failed to fetch review task status for business ${params?.businessId}`, error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

