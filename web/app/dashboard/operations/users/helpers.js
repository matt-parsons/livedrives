import pool from '@lib/db/db.js';

function toIsoString(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const time = Date.parse(value);
  if (Number.isNaN(time)) {
    return null;
  }

  return new Date(time).toISOString();
}

export async function loadOrganizationMembers(organizationId) {
  if (!organizationId) {
    return [];
  }

  const [rows] = await pool.query(
    `SELECT u.id,
            u.name,
            u.email,
            u.role          AS defaultRole,
            u.business_id   AS defaultBusinessId,
            u.created_at    AS userCreatedAt,
            m.role          AS organizationRole,
            m.created_at    AS memberJoinedAt
       FROM user_org_members m
       JOIN users u ON u.id = m.user_id
      WHERE m.organization_id = ?
      ORDER BY m.role = 'owner' DESC,
               u.created_at ASC,
               u.id ASC`,
    [organizationId]
  );

  return rows.map((row) => {
    const orgRole = row.organizationRole || row.defaultRole || 'member';

    return {
      id: Number(row.id),
      name: row.name || null,
      email: row.email || '',
      role: orgRole,
      defaultBusinessId: row.defaultBusinessId == null ? null : Number(row.defaultBusinessId),
      joinedAt: toIsoString(row.memberJoinedAt || row.userCreatedAt),
      createdAt: toIsoString(row.userCreatedAt),
      isOwner: orgRole === 'owner'
    };
  });
}

export async function loadOrganizationSubscription(organizationId) {
  if (!organizationId) {
    return null;
  }

  const [rows] = await pool.query(
    'SELECT * FROM organizations WHERE id = ? LIMIT 1',
    [organizationId]
  );

  if (!rows.length) {
    return null;
  }

  const record = rows[0];

  return {
    organizationId: Number(record.id),
    name: record.name || 'Workspace',
    status: record.subscription_status || null,
    plan: record.subscription_plan || record.plan || null,
    renewsAt: toIsoString(
      record.subscription_renews_at || record.renews_at || record.subscription_renews_on || null
    ),
    cancelledAt: toIsoString(record.subscription_cancelled_at || null),
    createdAt: toIsoString(record.created_at)
  };
}
