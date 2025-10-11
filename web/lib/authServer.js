import { cookies } from 'next/headers';
import mysqlPool from '@lib/db.js';
import { getFirebaseAdminAuth } from './firebaseAdmin';

const pool = mysqlPool?.default ?? mysqlPool;

export class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
    this.status = 401;
  }
}

export class ForbiddenError extends Error {
  constructor(message = 'Forbidden') {
    super(message);
    this.name = 'ForbiddenError';
    this.status = 403;
  }
}

export async function verifySessionCookie() {
  const cookieStore = cookies();
  const sessionCookie = cookieStore.get('__session');
  if (!sessionCookie?.value) {
    throw new UnauthorizedError('Missing session cookie');
  }

  try {
    const auth = getFirebaseAdminAuth();
    const decoded = await auth.verifySessionCookie(sessionCookie.value, true);
    return decoded;
  } catch (error) {
    console.error('Failed to verify session cookie:', error);
    throw new UnauthorizedError('Invalid session cookie');
  }
}

async function fetchUserByFirebaseUid(firebaseUid) {
  const [rows] = await pool.query(
    'SELECT id, firebase_uid, email FROM users WHERE firebase_uid = ? LIMIT 1',
    [firebaseUid]
  );
  return rows[0] ?? null;
}

async function fetchMembershipForUser(userId) {
  const [rows] = await pool.query(
    'SELECT organization_id, role FROM user_org_members WHERE user_id = ? LIMIT 1',
    [userId]
  );
  return rows[0] ?? null;
}

export async function getSessionContext() {
  const decoded = await verifySessionCookie();
  const user = await fetchUserByFirebaseUid(decoded.uid);
  return { decoded, user };
}

export async function requireAuth() {
  const { decoded, user } = await getSessionContext();
  if (!user) {
    throw new ForbiddenError('User not found');
  }

  const membership = await fetchMembershipForUser(user.id);
  if (!membership) {
    throw new ForbiddenError('Membership required');
  }

  return {
    userId: user.id,
    organizationId: membership.organization_id,
    role: membership.role,
    firebaseUid: decoded.uid,
    email: decoded.email ?? user.email ?? null,
  };
}

export function toErrorResponse(error) {
  if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: error.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  console.error('Unexpected error in auth handler:', error);
  return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
    status: 500,
    headers: { 'Content-Type': 'application/json' },
  });
}
