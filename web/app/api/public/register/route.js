import pool from '@lib/db/db.js';
import { NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebaseAdmin';
import { applySessionCookie, SESSION_MAX_AGE_MS } from '@/lib/authServer';
import {
  exchangeCustomTokenForIdToken,
  sendFirebaseVerificationEmail
} from '@/lib/firebaseVerification';
import { createHighLevelContact, isHighLevelConfigured } from '@/lib/highLevel';

export const runtime = 'nodejs';

function validateEmail(email) {
  if (typeof email !== 'string') {
    return false;
  }

  const trimmed = email.trim();
  if (!trimmed) {
    return false;
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailPattern.test(trimmed.toLowerCase());
}

export async function POST(request) {
  try {
    const payload = await request.json().catch(() => null);

    if (!payload || typeof payload !== 'object') {
      return NextResponse.json({ error: 'Invalid request payload.' }, { status: 400 });
    }

    const { email, name } = payload;

    if (!validateEmail(email)) {
      return NextResponse.json({ error: 'A valid email address is required.' }, { status: 400 });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedName = typeof name === 'string' ? name.trim() : '';
    const sanitizedName = trimmedName ? trimmedName.slice(0, 255) : '';
    const firebaseDisplayName = sanitizedName ? sanitizedName.slice(0, 128) : undefined;

    let userRecord;

    try {
      userRecord = await adminAuth.getUserByEmail(trimmedEmail);
      const shouldUpdateName = Boolean(firebaseDisplayName) && userRecord.displayName !== firebaseDisplayName;

      if (shouldUpdateName) {
        userRecord = await adminAuth.updateUser(userRecord.uid, {
          displayName: firebaseDisplayName
        });
      }
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        userRecord = await adminAuth.createUser({
          email: trimmedEmail,
          displayName: firebaseDisplayName
        });
      } else {
        throw error;
      }
    }

    if (!userRecord.emailVerified) {
      try {
        await sendFirebaseVerificationEmail(userRecord.uid, trimmedEmail);
      } catch (error) {
        console.error('Failed to send Firebase verification email', error);
        return NextResponse.json(
          { error: 'Unable to send verification email. Please try again later.' },
          { status: 502 }
        );
      }
    }

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      await connection.query(
        `INSERT INTO users (firebase_uid, email, name)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE
           email = VALUES(email),
           name = VALUES(name)`,
        [userRecord.uid, trimmedEmail, sanitizedName || null]
      );

      const [userRows] = await connection.query(
        'SELECT id FROM users WHERE firebase_uid = ? LIMIT 1',
        [userRecord.uid]
      );

      if (!userRows.length) {
        throw new Error('Unable to resolve user record after registration.');
      }

      const userId = userRows[0].id;

      await connection.query(
        `UPDATE funnel_leads
            SET converted_lead_id = ?, updated_at = UTC_TIMESTAMP()
          WHERE email = ?
            AND converted_lead_id IS NULL`,
        [userId, trimmedEmail]
      );

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
        const fallbackOrgName = (sanitizedName || trimmedEmail.split('@')[0] || 'New Organization').slice(0, 255);

        const [organizationResult] = await connection.query(
          'INSERT INTO organizations (name) VALUES (?)',
          [fallbackOrgName]
        );

        const organizationId = organizationResult.insertId;

        await connection.query(
          `INSERT INTO user_org_members (user_id, organization_id, role)
           VALUES (?, ?, 'member')`,
          [userId, organizationId]
        );

        await connection.query(
          `INSERT INTO organization_trials (organization_id, trial_starts_at, trial_ends_at, status)
             VALUES (?, NOW(), DATE_ADD(NOW(), INTERVAL 7 DAY), 'active')
             ON DUPLICATE KEY UPDATE organization_id = organization_id`,
          [organizationId]
        );

        membership = { organizationId, role: 'member' };
      }

      await connection.commit();

      const idToken = await exchangeCustomTokenForIdToken(userRecord.uid);
      const sessionCookie = await adminAuth.createSessionCookie(idToken, {
        expiresIn: SESSION_MAX_AGE_MS
      });

      if (isHighLevelConfigured()) {
        try {
          await createHighLevelContact({
            email: trimmedEmail,
            name: sanitizedName || trimmedEmail.split('@')[0] || trimmedEmail,
            tags: ['account_trial']
          });
        } catch (error) {
          console.error('Failed to sync HighLevel contact for registration', error?.response?.data || error);
        }
      } else {
        console.warn('HighLevel API not configured; skipping contact sync for registration.');
      }

      const body = {
        success: true,
        userId,
        organizationId: membership.organizationId,
        role: membership.role
      };

      const hostname = request?.nextUrl?.hostname ?? new URL(request.url).hostname;
      const response = NextResponse.json(body, { status: 201 });

      return applySessionCookie(response, sessionCookie, {
        hostname,
        maxAgeMs: SESSION_MAX_AGE_MS
      });
    } catch (error) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error('Failed to rollback registration transaction', rollbackError);
      }

      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Public registration failed', error);
    return NextResponse.json({ error: 'Unable to process registration at this time.' }, { status: 500 });
  }
}
