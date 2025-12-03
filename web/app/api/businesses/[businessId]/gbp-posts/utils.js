import pool from '@lib/db/db.js';
import { buildOrganizationScopeClause } from '@/lib/organizations';
import { BUSINESS_FIELDS } from '@/app/dashboard/[business]/helpers';

function normalizeString(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const str = String(value).trim();
  return str.length ? str : null;
}

function normalizeIsoDate(value) {
  if (!value) {
    return null;
  }

  const asDate = new Date(value);

  if (Number.isNaN(asDate.getTime())) {
    return null;
  }

  return asDate.toISOString();
}

export function normalizePostPayload(body, { partial = false } = {}) {
  const errors = [];
  const values = {};

  const headline = normalizeString(body.headline);
  const bodyContent = normalizeString(body.body);
  const callToAction = normalizeString(body.callToAction);
  const linkUrl = normalizeString(body.linkUrl);
  const scheduledFor = normalizeIsoDate(body.scheduledFor ?? body.scheduled_for);

  if (!partial || headline) {
    if (!headline) {
      errors.push('A short headline is required.');
    } else {
      values.headline = headline.slice(0, 120);
    }
  }

  if (!partial || bodyContent) {
    if (!bodyContent) {
      errors.push('Post body text is required.');
    } else {
      values.body = bodyContent.slice(0, 1200);
    }
  }

  if (callToAction) {
    values.callToAction = callToAction.slice(0, 60);
  }

  if (linkUrl) {
    values.linkUrl = linkUrl;
  }

  if (!partial || scheduledFor) {
    if (!scheduledFor) {
      errors.push('A scheduled date and time are required.');
    } else {
      values.scheduledFor = scheduledFor;
    }
  }

  if (body.status) {
    values.status = normalizeString(body.status);
  }

  return { errors, values };
}

export async function requireBusiness(session, businessId) {
  const scope = buildOrganizationScopeClause(session);
  const [rows] = await pool.query(
    `SELECT ${BUSINESS_FIELDS}
       FROM businesses
      WHERE id = ?
        AND ${scope.clause}
      LIMIT 1`,
    [businessId, ...scope.params]
  );

  if (!rows.length) {
    return null;
  }

  return rows[0];
}
