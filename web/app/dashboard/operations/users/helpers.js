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

function toDate(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  const time = Date.parse(value);
  if (Number.isNaN(time)) {
    return null;
  }

  return new Date(time);
}

function mapMemberRow(row) {
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
}

function mapSubscriptionRow(record) {
  if (!record) {
    return null;
  }

  return {
    organizationId: Number(record.id),
    name: record.name || 'Workspace',
    status: record.subscriptionStatus || null,
    plan: record.subscriptionPlan || record.plan || null,
    renewsAt: toIsoString(
      record.subscriptionRenewsAt || record.renewsAt || record.subscriptionRenewsOn || null
    ),
    cancelledAt: toIsoString(record.subscriptionCancelledAt || null),
    createdAt: toIsoString(record.createdAt)
  };
}

function mapTrialRow(row) {
  if (!row) {
    return null;
  }

  const organizationId = Number(row.organizationId);
  const startsAt = toDate(row.trialStartsAt);
  const endsAt = toDate(row.trialEndsAt);
  const createdAt = toDate(row.createdAt);
  const status = row.status || 'active';
  const now = new Date();
  const endsTime = endsAt ? endsAt.getTime() : null;
  const msRemaining = endsTime === null ? null : Math.max(0, endsTime - now.getTime());
  const daysRemaining = msRemaining === null ? null : Math.ceil(msRemaining / (24 * 60 * 60 * 1000));
  const isExpired = status === 'expired' || (endsTime !== null && now.getTime() > endsTime);
  const isActive = status === 'active' && !isExpired;

  return {
    organizationId,
    trialStartsAt: startsAt,
    trialEndsAt: endsAt,
    createdAt,
    status,
    isActive,
    isExpired,
    daysRemaining
  };
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

  return rows.map(mapMemberRow);
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

  return mapSubscriptionRow({
    id: record.id,
    name: record.name,
    subscriptionStatus: record.subscription_status,
    subscriptionPlan: record.subscription_plan,
    plan: record.plan,
    subscriptionRenewsAt: record.subscription_renews_at,
    renewsAt: record.renews_at,
    subscriptionRenewsOn: record.subscription_renews_on,
    subscriptionCancelledAt: record.subscription_cancelled_at,
    createdAt: record.created_at
  });
}

export async function loadAllOrganizationDirectories() {
  const [organizations] = await pool.query(
    `SELECT id,
            name,
            subscription_status      AS subscriptionStatus,
            subscription_plan        AS subscriptionPlan,
            plan,
            subscription_renews_at   AS subscriptionRenewsAt,
            renews_at                AS renewsAt,
            subscription_renews_on   AS subscriptionRenewsOn,
            subscription_cancelled_at AS subscriptionCancelledAt,
            created_at               AS createdAt
       FROM organizations
      ORDER BY created_at ASC`
  );

  if (!organizations.length) {
    return [];
  }

  const organizationIds = organizations.map((organization) => Number(organization.id));

  const [memberRows] = await pool.query(
    `SELECT m.organization_id AS organizationId,
            u.id,
            u.name,
            u.email,
            u.role          AS defaultRole,
            u.business_id   AS defaultBusinessId,
            u.created_at    AS userCreatedAt,
            m.role          AS organizationRole,
            m.created_at    AS memberJoinedAt
       FROM user_org_members m
       JOIN users u ON u.id = m.user_id
      WHERE m.organization_id IN (?)
      ORDER BY m.organization_id ASC,
               m.role = 'owner' DESC,
               u.created_at ASC,
               u.id ASC`,
    [organizationIds]
  );

  const membersByOrganization = new Map();
  for (const row of memberRows) {
    const orgId = Number(row.organizationId);
    if (!membersByOrganization.has(orgId)) {
      membersByOrganization.set(orgId, []);
    }
    membersByOrganization.get(orgId).push(mapMemberRow(row));
  }

  const [trialRows] = await pool.query(
    `SELECT organization_id AS organizationId,
            trial_starts_at AS trialStartsAt,
            trial_ends_at   AS trialEndsAt,
            status,
            created_at      AS createdAt
       FROM organization_trials
      WHERE organization_id IN (?)
      ORDER BY created_at DESC`,
    [organizationIds]
  );

  const trialsByOrganization = new Map();
  for (const row of trialRows) {
    const trial = mapTrialRow(row);
    if (!trial) {
      continue;
    }

    if (!trialsByOrganization.has(trial.organizationId)) {
      trialsByOrganization.set(trial.organizationId, trial);
    }
  }

  return organizations.map((organization) => {
    const orgId = Number(organization.id);

    return {
      organizationId: orgId,
      organizationName: organization.name || 'Workspace',
      subscription: mapSubscriptionRow(organization),
      trial: trialsByOrganization.get(orgId) || null,
      members: membersByOrganization.get(orgId) || []
    };
  });
}
