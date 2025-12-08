import { AuthError, verifySession } from '@/lib/authServer';
import { bootstrapUser } from '@/lib/bootstrapUser';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const decoded = await verifySession(request);
    const { userId, membership } = await bootstrapUser(decoded);

    return Response.json({
      userId,
      organizationId: membership.organizationId,
      role: membership.role
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }

    console.error('Failed to bootstrap session', error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
