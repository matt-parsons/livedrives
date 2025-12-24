import { NextResponse } from 'next/server';
import pool from '@lib/db/db.js';
import { requireAuth } from '@/lib/authServer';
import { loadAllOrganizationDirectories } from '@/app/dashboard/operations/users/helpers';
import { isHighLevelConfigured, upsertHighLevelContact } from '@/lib/highLevel.server';

async function expireTrialIfNeeded(organizationId) {
  const [result] = await pool.query(
    `UPDATE organization_trials
        SET status = 'expired'
      WHERE organization_id = ?
        AND status = 'active'
        AND trial_ends_at < NOW()`,
    [organizationId]
  );

  return result?.affectedRows > 0;
}

export async function GET(request, { params }) {
  try {
    const session = await requireAuth();
    const { organizationId: requestedOrganizationId } = params;

    if (!requestedOrganizationId) {
      return NextResponse.json({ error: 'Organization ID is required' }, { status: 400 });
    }

    const organizations = await loadAllOrganizationDirectories();

    const currentOrganization = organizations.find(
      (org) => String(org.organizationId) === String(requestedOrganizationId)
    );

    if (!currentOrganization) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    // Ensure the authenticated user has access to this organization
    if (String(session.organizationId) !== String(currentOrganization.organizationId)) {
      return NextResponse.json({ error: 'Unauthorized access to organization' }, { status: 403 });
    }

    if (currentOrganization.trial?.status === 'active') {
      const didExpire = await expireTrialIfNeeded(currentOrganization.organizationId);

      if (didExpire && isHighLevelConfigured() && session.email) {
        const contactName = session.name || session.email?.split('@')[0] || session.email;
        try {
          await upsertHighLevelContact({
            email: session.email,
            name: contactName,
            tags: ['trial_expired']
          });
        } catch (error) {
          console.error('Failed to sync HighLevel contact for trial expiration', error?.response?.data || error);
        }
      } else if (didExpire && !isHighLevelConfigured()) {
        console.warn('HighLevel API not configured; skipping trial expiration tag sync.');
      }

      if (didExpire && currentOrganization.trial) {
        currentOrganization.trial = {
          ...currentOrganization.trial,
          status: 'expired',
          isActive: false,
          isExpired: true,
          daysRemaining: 0
        };
      }
    }

    return NextResponse.json({
      subscription: currentOrganization.subscription,
      trial: currentOrganization.trial
    });
  } catch (error) {
    if (error.name === 'AuthError') {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('API Error fetching organization data:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
