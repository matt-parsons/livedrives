import pool from '@lib/db.js';
import { AuthError, verifySession } from '@/lib/authServer';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const decoded = await verifySession(request);
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      await connection.query(
        `INSERT INTO users (firebase_uid, email, name)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE
           email = VALUES(email),
           name = VALUES(name)`,
        [decoded.uid, decoded.email ?? null, decoded.name ?? null]
      );

      const [userRows] = await connection.query(
        'SELECT id FROM users WHERE firebase_uid = ? LIMIT 1',
        [decoded.uid]
      );

      if (!userRows.length) {
        throw new Error('Failed to resolve user record after upsert');
      }

      const userId = userRows[0].id;

      const [membershipRows] = await connection.query(
        `SELECT organization_id AS organizationId, role
           FROM user_org_members
          WHERE user_id = ?
          ORDER BY created_at IS NULL, id
          LIMIT 1`,
        [userId]
      );

      let membership = membershipRows[0];

      if (!membership) {
        const organizationName = decoded.email?.split('@')[0] || 'My Organization';
        const [organizationResult] = await connection.query(
          'INSERT INTO organizations (name) VALUES (?)',
          [organizationName]
        );

        const organizationId = organizationResult.insertId;

        await connection.query(
          `INSERT INTO user_org_members (user_id, organization_id, role)
           VALUES (?, ?, 'owner')`,
          [userId, organizationId]
        );

        membership = { organizationId, role: 'owner' };
      }

      await connection.commit();

      return Response.json({
        userId,
        organizationId: membership.organizationId,
        role: membership.role
      });
    } catch (error) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error('Failed to rollback bootstrap transaction', rollbackError);
      }
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }

    console.error('Failed to bootstrap session', error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
