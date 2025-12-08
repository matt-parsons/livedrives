import { NextResponse } from 'next/server';
import pool from '@lib/db/db.js';
import { adminAuth } from '@/lib/firebaseAdmin';
import { applySessionCookie, AuthError, requireAuth } from '@/lib/authServer';

export const runtime = 'nodejs';

function buildErrorResponse(error, fallbackMessage = 'Internal Server Error') {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode });
  }

  console.error('Account endpoint error', error);
  return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}

function validateEmail(email) {
  if (typeof email !== 'string') {
    return false;
  }

  const trimmed = email.trim();
  return trimmed.length > 3 && trimmed.includes('@');
}

export async function PATCH(request) {
  try {
    const session = await requireAuth(request);
    const payload = await request.json().catch(() => ({}));
    const { email, password } = payload;

    if (!email && !password) {
      return NextResponse.json({ error: 'Email or password is required.' }, { status: 400 });
    }

    const updates = {};

    if (email) {
      if (!validateEmail(email)) {
        return NextResponse.json({ error: 'Invalid email address.' }, { status: 400 });
      }

      updates.email = email.trim();
    }

    if (password) {
      if (typeof password !== 'string' || password.trim().length < 8) {
        return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
      }

      updates.password = password.trim();
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No updates to apply.' }, { status: 400 });
    }

    const updatedUser = await adminAuth.updateUser(session.firebaseUid, updates);

    if (updates.email) {
      await pool.query('UPDATE users SET email = ? WHERE id = ?', [updates.email, session.userId]);
    }

    return NextResponse.json({
      status: 'ok',
      email: updates.email ?? updatedUser.email ?? session.email
    });
  } catch (error) {
    return buildErrorResponse(error, 'Failed to update account.');
  }
}

export async function DELETE(request) {
  try {
    const session = await requireAuth(request);

    try {
      await adminAuth.deleteUser(session.firebaseUid);
    } catch (error) {
      // If the user is already deleted in Firebase, continue cleaning up local data
      if (error?.code !== 'auth/user-not-found') {
        throw error;
      }
    }

    await pool.query('DELETE FROM users WHERE id = ?', [session.userId]);

    return applySessionCookie(NextResponse.json({ status: 'deleted' }), '', {
      hostname: request?.nextUrl?.hostname ?? new URL(request.url).hostname,
      maxAgeMs: 0
    });
  } catch (error) {
    return buildErrorResponse(error, 'Failed to cancel account.');
  }
}
