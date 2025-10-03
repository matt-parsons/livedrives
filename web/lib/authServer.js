import { cookies } from 'next/headers';
import pool from '@/lib/db';
import { adminAuth } from '@/lib/firebaseAdmin';

const SESSION_COOKIE_NAME = '__session';

export class AuthError extends Error {
  constructor(statusCode = 401, message = 'Unauthorized') {
    super(message);
    this.name = 'AuthError';
    this.statusCode = statusCode;
  }
}

async function getSessionCookie(request) {
  if (request?.cookies) {
    const cookie = typeof request.cookies.get === 'function'
      ? request.cookies.get(SESSION_COOKIE_NAME)
      : request.cookies[SESSION_COOKIE_NAME];

    return cookie?.value ?? cookie ?? null;
  }

  return cookies().get(SESSION_COOKIE_NAME)?.value ?? null;
}

export async function requireAuth(request) {
  const sessionCookie = await getSessionCookie(request);

  if (!sessionCookie) {
    throw new AuthError(401, 'Missing session cookie');
  }

  let decoded;
  try {
    decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
  } catch (error) {
    throw new AuthError(401, 'Invalid session cookie');
  }

  const [rows] = await pool.query(
    `SELECT u.id            AS userId,
            u.firebase_uid  AS firebaseUid,
            u.email         AS email,
            u.name          AS name,
            m.organization_id AS organizationId,
            m.role          AS role
       FROM users u
       JOIN user_org_members m ON m.user_id = u.id
      WHERE u.firebase_uid = ?
      ORDER BY m.created_at IS NULL, m.id
      LIMIT 1`,
    [decoded.uid]
  );

  if (!rows.length) {
    throw new AuthError(403, 'User is not linked to an organization');
  }

  return {
    userId: rows[0].userId,
    firebaseUid: rows[0].firebaseUid,
    email: rows[0].email,
    name: rows[0].name,
    organizationId: rows[0].organizationId,
    role: rows[0].role
  };
}
