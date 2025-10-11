import mysqlPool from '@lib/db.js';
import { verifySessionCookie, toErrorResponse } from '@/lib/authServer';

const pool = mysqlPool?.default ?? mysqlPool;

export async function POST() {
  const connection = await pool.getConnection();
  try {
    const decoded = await verifySessionCookie();
    await connection.beginTransaction();

    const email = decoded.email ?? null;
    const firebaseUid = decoded.uid;

    const [userResult] = await connection.query(
      `INSERT INTO users (firebase_uid, email)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE email = VALUES(email)`,
      [firebaseUid, email]
    );

    let userId = userResult.insertId;
    if (!userId) {
      const [existingUsers] = await connection.query(
        'SELECT id FROM users WHERE firebase_uid = ? LIMIT 1',
        [firebaseUid]
      );
      if (!existingUsers.length) {
        throw new Error('User record missing after upsert');
      }
      userId = existingUsers[0].id;
    }

    const [memberships] = await connection.query(
      'SELECT organization_id, role FROM user_org_members WHERE user_id = ? LIMIT 1',
      [userId]
    );

    let organizationId;
    let role;

    if (memberships.length) {
      ({ organization_id: organizationId, role } = memberships[0]);
    } else {
      const organizationName = email ? `${email}'s Organization` : 'New Organization';
      const [orgResult] = await connection.query(
        'INSERT INTO organizations (name) VALUES (?)',
        [organizationName]
      );
      organizationId = orgResult.insertId;
      role = 'owner';

      await connection.query(
        'INSERT INTO user_org_members (user_id, organization_id, role) VALUES (?, ?, ?)',
        [userId, organizationId, role]
      );
    }

    await connection.commit();

    return Response.json({ userId, organizationId, role });
  } catch (error) {
    await connection.rollback().catch(() => {});
    if (error instanceof Error && error.message === 'User record missing after upsert') {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return toErrorResponse(error);
  } finally {
    connection.release();
  }
}
