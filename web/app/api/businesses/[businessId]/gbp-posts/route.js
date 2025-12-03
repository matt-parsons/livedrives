import { AuthError, requireAuth } from '@/lib/authServer';
import {
  createScheduledPost,
  listScheduledPostsForBusiness
} from '@/lib/gbpPostScheduler';
import { normalizePostPayload, requireBusiness } from './utils';

export const runtime = 'nodejs';

export async function GET(request, { params }) {
  const businessId = Number(params?.businessId);

  if (!Number.isFinite(businessId) || businessId <= 0) {
    return Response.json({ error: 'Invalid business identifier.' }, { status: 400 });
  }

  try {
    const session = await requireAuth(request);
    const business = await requireBusiness(session, businessId);

    if (!business) {
      return Response.json({ error: 'Business not found.' }, { status: 404 });
    }

    const posts = await listScheduledPostsForBusiness(businessId);
    return Response.json({ posts, timezone: business.timezone || 'UTC' });
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }

    console.error(`Failed to load GBP post schedule for business ${params?.businessId}`, error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  const businessId = Number(params?.businessId);

  if (!Number.isFinite(businessId) || businessId <= 0) {
    return Response.json({ error: 'Invalid business identifier.' }, { status: 400 });
  }

  try {
    const session = await requireAuth(request);
    const business = await requireBusiness(session, businessId);

    if (!business) {
      return Response.json({ error: 'Business not found.' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const { errors, values } = normalizePostPayload(body, { partial: false });

    if (errors.length) {
      return Response.json({ error: errors.join(' ') }, { status: 400 });
    }

    const post = await createScheduledPost(businessId, values);

    return Response.json({ post }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }

    console.error(`Failed to schedule GBP post for business ${params?.businessId}`, error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
