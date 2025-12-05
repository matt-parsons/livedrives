import { NextResponse } from 'next/server';
import pool from '@lib/db/db.js';
import { adminAuth } from '@/lib/firebaseAdmin';
import { AuthError, requireAuth } from '@/lib/authServer';
import {
  deleteOrganizationData,
  deleteOrganizationMembers,
  loadOrganizationLock,
  loadOrganizationMembersForDeletion,
  parseOrganizationId
} from '@lib/owner/organizations.js';

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

  const organizationId = parseOrganizationId(params?.organizationId);

  if (!organizationId) {
    return jsonError('Invalid organization id.', 400);
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const organization = await loadOrganizationLock(connection, organizationId);

    if (!organization) {
      await connection.rollback();
      return jsonError('Organization not found.', 404);
    }

    const members = await loadOrganizationMembersForDeletion(connection, organizationId);

    await deleteOrganizationMembers(connection, members, organizationId);
    await deleteOrganizationData(connection, organizationId);
    await connection.query('DELETE FROM organizations WHERE id = ?', [organizationId]);

    for (const member of members) {
      try {
        await adminAuth.deleteUser(member.firebaseUid);
      } catch (error) {
        if (error?.code !== 'auth/user-not-found') {
          throw error;
        }
      }
    }

    await connection.commit();

    return NextResponse.json({
      status: 'deleted',
      organizationId: organization.id,
      organizationName: organization.name,
      deletedUserIds: members.map((member) => member.id),
      deletedUserCount: members.length
    });
  } catch (error) {
    await connection.rollback();
    console.error('Failed to delete organization', error);
    return jsonError('Failed to delete organization.', 500);
  } finally {
    connection.release();
  }
}
