import { cache } from 'react';
import { cookies } from 'next/headers';
import pool from '@lib/db/db.js';
import { adminAuth } from '@/lib/firebaseAdmin';
import { getRolePreviewCookie, isRolePreviewSupported } from '@/lib/rolePreview';

export const SESSION_COOKIE_NAME = '__session';
export const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const PUBLIC_SUFFIX_EXCEPTIONS = new Set([
  'ac.uk',
  'co.uk',
  'gov.uk',
  'ltd.uk',
  'me.uk',
  'net.uk',
  'org.uk',
  'plc.uk',
  'sch.uk',
  'com.au',
  'net.au',
  'org.au',
  'edu.au',
  'gov.au',
  'csiro.au',
  'asn.au',
  'vercel.app',
  'onrender.com',
  'herokuapp.com',
  'appspot.com'
]);

function normalizeHostname(hostname) {
  if (!hostname || typeof hostname !== 'string') {
    return null;
  }

  const stripped = hostname.split(':')[0]?.toLowerCase();

  if (!stripped || stripped === 'localhost' || /^\d{1,3}(\.\d{1,3}){3}$/.test(stripped)) {
    return null;
  }

  return stripped;
}

export function getCookieDomain(hostname) {
  const normalized = normalizeHostname(hostname);

  if (!normalized) {
    return null;
  }

  const parts = normalized.split('.');

  if (parts.length < 2) {
    return null;
  }

  const registrableCandidate = parts.slice(-2).join('.');
  const needsExtraLabel = PUBLIC_SUFFIX_EXCEPTIONS.has(registrableCandidate);

  if (needsExtraLabel) {
    if (parts.length >= 3) {
      return `.${parts.slice(-3).join('.')}`;
    }

    return null;
  }

  return `.${registrableCandidate}`;
}

export function applySessionCookie(response, value, { hostname, domain: domainOpt, maxAgeMs = SESSION_MAX_AGE_MS } = {}) {
  const domain = domainOpt ?? getCookieDomain(hostname);

  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value,
    maxAge: Math.max(Math.floor(maxAgeMs / 1000), 0),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    ...(domain ? { domain } : {})
  });

  return response;
}

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

export const getOptionalSession = cache(async function getOptionalSession(request) {
  try {
    return await requireAuth(request);
  } catch (error) {
    if (error instanceof AuthError && error.statusCode >= 400 && error.statusCode < 500) {
      return null;
    }

    throw error;
  }
});
