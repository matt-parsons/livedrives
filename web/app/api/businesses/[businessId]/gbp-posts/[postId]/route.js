import { AuthError, requireAuth } from '@/lib/authServer';
import { deleteScheduledPost, updateScheduledPost } from '@/lib/gbpPostScheduler';
import { normalizePostPayload, requireBusiness } from '../utils';

export const runtime = 'nodejs';

export async function PATCH(request, { params }) {
  const businessId = Number(params?.businessId);
  const postId = params?.postId;

  if (!Number.isFinite(businessId) || businessId <= 0 || !postId) {
    return Response.json({ error: 'Invalid request.' }, { status: 400 });
  }

  try {
    const session = await requireAuth(request);
    const business = await requireBusiness(session, businessId);

    if (!business) {
      return Response.json({ error: 'Business not found.' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const { errors, values } = normalizePostPayload(body, { partial: true });

    if (errors.length) {
      return Response.json({ error: errors.join(' ') }, { status: 400 });
    }

    const updated = await updateScheduledPost(businessId, postId, values);

    if (!updated) {
      return Response.json({ error: 'Scheduled post not found.' }, { status: 404 });
    }

    return Response.json({ post: updated });
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }

    console.error(
      `Failed to update GBP post ${params?.postId} for business ${params?.businessId}`,
      error
    );
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const businessId = Number(params?.businessId);
  const postId = params?.postId;

  if (!Number.isFinite(businessId) || businessId <= 0 || !postId) {
    return Response.json({ error: 'Invalid request.' }, { status: 400 });
  }

  try {
    const session = await requireAuth(request);
    const business = await requireBusiness(session, businessId);

    if (!business) {
      return Response.json({ error: 'Business not found.' }, { status: 404 });
    }

    const deleted = await deleteScheduledPost(businessId, postId);

    if (!deleted) {
      return Response.json({ error: 'Scheduled post not found.' }, { status: 404 });
    }

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }

    console.error(
      `Failed to delete GBP post ${params?.postId} for business ${params?.businessId}`,
      error
    );
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
