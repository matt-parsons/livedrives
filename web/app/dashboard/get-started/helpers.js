import pool from '@lib/db/db.js';
import { loadBusiness, loadOriginZones, loadOrganizationBusinesses } from '../[business]/helpers.js';

function toDate(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time);
}

export async function loadTrialStatus(organizationId) {
  if (!organizationId) {
    return null;
  }

  const [rows] = await pool.query(
    `SELECT organization_id AS organizationId,
            trial_starts_at AS trialStartsAt,
            trial_ends_at   AS trialEndsAt,
            status,
            created_at      AS createdAt
       FROM organization_trials
      WHERE organization_id = ?
      LIMIT 1`,
    [organizationId]
  );

  if (!rows.length) {
    return null;
  }

  const row = rows[0];
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
    organizationId: row.organizationId,
    trialStartsAt: startsAt,
    trialEndsAt: endsAt,
    createdAt,
    status,
    isActive,
    isExpired,
    daysRemaining
  };
}

export async function loadJourneyBusinessContext(organizationId) {
  const businesses = await loadOrganizationBusinesses(organizationId);

  if (!businesses.length) {
    return {
      businesses,
      primarySummary: null,
      primaryBusiness: null,
      originZones: []
    };
  }

  const primarySummary = businesses[0];
  const identifier = primarySummary.businessSlug ?? String(primarySummary.id);
  const primaryBusiness = await loadBusiness(organizationId, identifier);
  const originZones = primaryBusiness ? await loadOriginZones(primaryBusiness.id) : [];

  return {
    businesses,
    primarySummary,
    primaryBusiness,
    originZones
  };
}
