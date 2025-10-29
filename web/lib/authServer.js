import { cookies } from 'next/headers';
import pool from '@lib/db/db.js';
import { adminAuth } from '@/lib/firebaseAdmin';
import { getRolePreviewCookie, isRolePreviewSupported } from '@/lib/rolePreview';

export const SESSION_COOKIE_NAME = '__session';
export const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export class AuthError extends Error {
  constructor(statusCode = 401, message = 'Unauthorized') {
    super(message);
    this.name = 'AuthError';
    this.statusCode = statusCode;
  }
}

export async function getSessionCookie(request) {
  if (request?.cookies) {
    const cookie = typeof request.cookies.get === 'function'
      ? request.cookies.get(SESSION_COOKIE_NAME)
      : request.cookies[SESSION_COOKIE_NAME];

    return cookie?.value ?? cookie ?? null;
  }

  return cookies().get(SESSION_COOKIE_NAME)?.value ?? null;
}

export async function verifySession(request) {
  const sessionCookie = await getSessionCookie(request);

  if (!sessionCookie) {
    throw new AuthError(401, 'Missing session cookie');
  }

  try {
    return await adminAuth.verifySessionCookie(sessionCookie, true);
  } catch (error) {
    throw new AuthError(401, 'Invalid session cookie');
  }
}

export async function requireAuth(request) {
  const decoded = await verifySession(request);

  const [rows] = await pool.query(
    `SELECT u.id              AS userId,
            u.firebase_uid    AS firebaseUid,
            u.email           AS email,
            u.name            AS name,
            u.business_id     AS defaultBusinessId,
            m.organization_id AS organizationId,
            m.role            AS role
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

  const actualRole = rows[0].role;
  const previewRole = getRolePreviewCookie(request);
  const isPreviewActive = isRolePreviewSupported(previewRole) && previewRole !== actualRole;
  const effectiveRole = isPreviewActive ? previewRole : actualRole;

  return {
    userId: rows[0].userId,
    firebaseUid: rows[0].firebaseUid,
    email: rows[0].email,
    name: rows[0].name,
    defaultBusinessId: rows[0].defaultBusinessId,
    organizationId: rows[0].organizationId,
    role: effectiveRole,
    actualRole,
    previewRole: isPreviewActive ? previewRole : null
  };
}
