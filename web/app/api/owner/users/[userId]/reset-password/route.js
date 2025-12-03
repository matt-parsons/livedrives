import { NextResponse } from 'next/server';
import pool from '@lib/db/db.js';
import { adminAuth } from '@/lib/firebaseAdmin';
import { AuthError, requireAuth } from '@/lib/authServer';

export const runtime = 'nodejs';

function jsonError(message, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function handleAuthFailure(error) {
  if (error instanceof AuthError && error.statusCode >= 400 && error.statusCode < 500) {
    return jsonError(error.message, error.statusCode);
  }

  throw error;
}

function parseUserId(raw) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  return value;
}

function parseOrganizationId(raw) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  return value;
}

export async function POST(request, { params }) {
  let session;

  try {
    session = await requireAuth(request);
  } catch (error) {
    return handleAuthFailure(error);
  }

  if (session.actualRole !== 'admin') {
    return jsonError('Forbidden', 403);
  }

  const userId = parseUserId(params?.userId);

  if (!userId) {
    return jsonError('Invalid user id.', 400);
  }

  const { searchParams } = new URL(request.url);
  const organizationId = parseOrganizationId(searchParams.get('organizationId')) || session.organizationId;

  const [rows] = await pool.query(
    `SELECT u.id, u.email
       FROM user_org_members m
       JOIN users u ON u.id = m.user_id
      WHERE m.organization_id = ?
        AND u.id = ?
      LIMIT 1`,
    [organizationId, userId]
  );

  if (!rows.length) {
    return jsonError('User not found in this organization.', 404);
  }

  const email = rows[0].email;

  if (!email) {
    return jsonError('The selected user is missing an email address.', 400);
  }

  let actionSettings;
  const continueUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL;

  if (continueUrl) {
    try {
      const target = new URL('/signin', continueUrl);
      actionSettings = {
        url: target.toString(),
        handleCodeInApp: true
      };
    } catch (error) {
      actionSettings = undefined;
    }
  }

  try {
    const resetLink = await adminAuth.generatePasswordResetLink(email, actionSettings);

    return NextResponse.json({
      status: 'ok',
      email,
      resetLink
    });
  } catch (error) {
    console.error('Failed to generate password reset link', error);
    return jsonError('Failed to generate password reset link.', 500);
  }
}
