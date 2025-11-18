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

export async function DELETE(request, { params }) {
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

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [memberRows] = await connection.query(
      `SELECT u.id,
              u.firebase_uid AS firebaseUid,
              u.email,
              m.role AS memberRole
         FROM user_org_members m
         JOIN users u ON u.id = m.user_id
        WHERE m.organization_id = ?
          AND u.id = ?
        FOR UPDATE`,
      [session.organizationId, userId]
    );

    if (!memberRows.length) {
      await connection.rollback();
      return jsonError('User not found in this organization.', 404);
    }

    const target = memberRows[0];

    const [countRows] = await connection.query(
      `SELECT COUNT(*) AS memberCount
         FROM user_org_members
        WHERE organization_id = ?
        FOR UPDATE`,
      [session.organizationId]
    );

    const memberCount = Number(countRows[0]?.memberCount ?? 0);
    const isLastMember = memberCount <= 1;
    const shouldDeleteOrganization = isLastMember && target.memberRole === 'owner';

    await connection.query(
      'DELETE FROM user_org_members WHERE user_id = ? AND organization_id = ?',
      [userId, session.organizationId]
    );

    if (shouldDeleteOrganization) {
      await connection.query('DELETE FROM businesses WHERE organization_id = ?', [session.organizationId]);
    }

    await connection.query('DELETE FROM users WHERE id = ?', [userId]);

    if (shouldDeleteOrganization) {
      await connection.query('DELETE FROM organizations WHERE id = ?', [session.organizationId]);
    }

    try {
      await adminAuth.deleteUser(target.firebaseUid);
    } catch (error) {
      if (error?.code !== 'auth/user-not-found') {
        throw error;
      }
    }

    await connection.commit();

    return NextResponse.json({
      status: 'deleted',
      deletedUserId: userId,
      deletedSelf: session.userId === userId,
      organizationDeleted: shouldDeleteOrganization
    });
  } catch (error) {
    await connection.rollback();
    console.error('Failed to delete user', error);
    return jsonError('Failed to delete user.', 500);
  } finally {
    connection.release();
  }
}
