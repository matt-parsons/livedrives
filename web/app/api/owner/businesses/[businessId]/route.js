import { NextResponse } from 'next/server';
import pool from '@lib/db/db.js';
import { AuthError, requireAuth } from '@/lib/authServer';
import { deleteBusinessData, parseOrganizationId } from '@lib/owner/organizations.js';

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

function parseBusinessId(raw) {
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

  const businessId = parseBusinessId(params?.businessId);

  if (!businessId) {
    return jsonError('Invalid business id.', 400);
  }

  const { searchParams } = new URL(request.url);
  const organizationId = parseOrganizationId(searchParams.get('organizationId'));

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [businessRows] = await connection.query(
      `SELECT id, organization_id AS organizationId, business_name AS businessName
         FROM businesses
        WHERE id = ?
        FOR UPDATE`,
      [businessId]
    );

    if (!businessRows.length) {
      await connection.rollback();
      return jsonError('Business not found.', 404);
    }

    const business = {
      id: Number(businessRows[0]?.id),
      organizationId: Number(businessRows[0]?.organizationId) || null,
      businessName: businessRows[0]?.businessName || ''
    };

    if (organizationId && business.organizationId !== organizationId) {
      await connection.rollback();
      return jsonError('Business not found in this organization.', 404);
    }

    await deleteBusinessData(connection, business.id);

    await connection.commit();

    return NextResponse.json({
      status: 'deleted',
      businessId: business.id,
      organizationId: business.organizationId,
      businessName: business.businessName
    });
  } catch (error) {
    await connection.rollback();
    console.error('Failed to delete business', error);
    return jsonError('Failed to delete business.', 500);
  } finally {
    connection.release();
  }
}
