import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { AuthError, requireAuth } from '@/lib/authServer';

export const runtime = 'nodejs';

export async function GET(request) {
  try {
    const session = await requireAuth(request);
    const [rows] = await pool.query(
      `SELECT id, name, organization_id AS organizationId
         FROM businesses
        WHERE organization_id = ?
        ORDER BY name ASC`,
      [session.organizationId]
    );

    return NextResponse.json({ businesses: rows });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    console.error('Failed to load businesses', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
