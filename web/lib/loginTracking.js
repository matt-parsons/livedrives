import pool from '@lib/db/db.js';
import { isHighLevelConfigured, upsertHighLevelContact } from '@/lib/highLevel.server';

const TRIAL_ENGAGED_DELAY_MS = 12 * 60 * 60 * 1000;

export async function trackUserLogin({ firebaseUid }) {
  if (!firebaseUid) {
    return;
  }

  const [rows] = await pool.query(
    `SELECT u.id AS userId,
            u.email AS email,
            u.name AS name,
            u.last_login_at AS lastLoginAt,
            m.organization_id AS organizationId,
            t.trial_starts_at AS trialStartsAt,
            t.trial_ends_at AS trialEndsAt,
            t.status AS trialStatus
       FROM users u
       JOIN user_org_members m ON m.user_id = u.id
       LEFT JOIN organization_trials t ON t.organization_id = m.organization_id
      WHERE u.firebase_uid = ?
      ORDER BY m.created_at IS NULL, m.id
      LIMIT 1`,
    [firebaseUid]
  );

  if (!rows.length) {
    return;
  }

  const row = rows[0];

  await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [row.userId]);

  if (!row.lastLoginAt) {
    return;
  }

  const now = new Date();
  const trialStartsAt = row.trialStartsAt ? new Date(row.trialStartsAt) : null;
  const trialEndsAt = row.trialEndsAt ? new Date(row.trialEndsAt) : null;
  const isTrialActive = row.trialStatus === 'active'
    && trialStartsAt
    && trialEndsAt
    && now >= trialStartsAt
    && now <= trialEndsAt;

  if (!isTrialActive) {
    return;
  }

  if (now.getTime() - trialStartsAt.getTime() < TRIAL_ENGAGED_DELAY_MS) {
    return;
  }

  if (!isHighLevelConfigured()) {
    console.warn('HighLevel API not configured; skipping trial engaged tag sync.');
    return;
  }

  if (!row.email) {
    return;
  }

  try {
    await upsertHighLevelContact({
      email: row.email,
      name: row.name || row.email.split('@')[0] || row.email,
      tags: ['account_trial','trial_engaged']
    });
  } catch (error) {
    console.error('Failed to sync HighLevel contact for trial engagement', error?.response?.data || error);
  }
}
