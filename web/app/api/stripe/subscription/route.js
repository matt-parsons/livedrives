import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import pool from '@lib/db/db.js';
import { AuthError, requireAuth } from '@/lib/authServer';

function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }

  return new Stripe(secretKey, { apiVersion: '2024-06-20' });
}

async function updateOrganizationSubscription(organizationId, status, planId, planName, renewsAt, stripeSubscriptionId) {
  await pool.query(
    `UPDATE organizations
        SET subscription_status = ?,
            subscription_plan = ?,
            stripe_subscription_name = ?,
            subscription_renews_at = ?,
            stripe_subscription_id = ?
      WHERE id = ?`,
    [status ?? null, planId ?? null, planName ?? null, renewsAt ?? null, stripeSubscriptionId ?? null, organizationId]
  );
}

async function removeOrganizationTrial(organizationId) {
  await pool.query(
    `DELETE FROM organization_trials WHERE organization_id = ?`,
    [organizationId]
  );
}

function resolveRenewalDate(subscription) {
  if (!subscription?.current_period_end) {
    return null;
  }

  return new Date(subscription.current_period_end * 1000);
}

function resolvePlanId(subscription) {
  return subscription?.items?.data?.[0]?.price?.id ?? null;
}

function resolvePlanName(subscription) {
  console.log(subscription);
  return subscription?.items?.data?.[0]?.price?.product?.name ?? null;
}

export async function PATCH(request) {
  try {
    const session = await requireAuth();
    const stripe = getStripeClient();
    const body = await request.json();
    const sessionId = body?.sessionId;

    if (!sessionId) {
      return NextResponse.json({ error: 'Stripe sessionId is required' }, { status: 400 });
    }

    const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription']
    });

    const organizationId = checkoutSession?.metadata?.organizationId;

    if (!organizationId || String(organizationId) !== String(session.organizationId)) {
      return NextResponse.json({ error: 'Unauthorized organization update' }, { status: 403 });
    }

    const subscription =
      typeof checkoutSession.subscription === 'string'
        ? await stripe.subscriptions.retrieve(checkoutSession.subscription, { expand: ['items.data.price.product'] })
        : checkoutSession.subscription;

    const subscriptionStatus = subscription.status;
    const planId = resolvePlanId(subscription);
    const planName = resolvePlanName(subscription);
    const renewsAt = resolveRenewalDate(subscription);
    const stripeSubscriptionId = subscription.id;

    console.log('[Stripe Subscription] Retrieved subscription:', JSON.stringify(subscription, null, 2));
    console.log('[Stripe Subscription] Resolved Plan Name:', planName);

    await updateOrganizationSubscription(session.organizationId, subscriptionStatus, planId,  planName, renewsAt, stripeSubscriptionId);
    await removeOrganizationTrial(session.organizationId);

    return NextResponse.json({
      subscriptionStatus,
      subscriptionPlan: planId,
      subscriptionPlanName: planName,
      subscriptionRenewsAt: renewsAt?.toISOString() ?? null
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    console.error('Failed to sync Stripe subscription', error);
    return NextResponse.json({ error: 'Unable to sync subscription' }, { status: 500 });
  }
}

async function getOrganization(organizationId) {
  const [rows] = await pool.query(
    `SELECT id, stripe_subscription_id FROM organizations WHERE id = ?`,
    [organizationId]
  );
  return rows[0] || null;
}

export async function DELETE(request) {
  try {
    const session = await requireAuth();
    const stripe = getStripeClient();
    const organizationId = session.organizationId;

    const organization = await getOrganization(organizationId);
    if (!organization || !organization.stripe_subscription_id) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    // Cancel the subscription on Stripe
    await stripe.subscriptions.cancel(organization.stripe_subscription_id);

    // Get all businesses for the organization
    // const [businesses] = await pool.query(
    //   `SELECT id FROM businesses WHERE organization_id = ?`,
    //   [organizationId]
    // );

    // Delete all businesses and their related data
    // for (const business of businesses) {
    //   // Manually delete related data that is not cascaded
    //   await pool.query(`DELETE FROM ranking_snapshots WHERE business_id = ?`, [business.id]);
    //   await pool.query(`DELETE FROM run_logs WHERE business_id = ?`, [business.id]);
      
    //   // Delete the business, which will trigger cascades for other data
    //   await pool.query(`DELETE FROM businesses WHERE id = ?`, [business.id]);
    // }

    // Update the organization's subscription status
    await pool.query(
      `UPDATE organizations
          SET subscription_status = 'canceled',
              subscription_plan = NULL,
              stripe_subscription_name = NULL,
              subscription_cancelled_at = NOW()
        WHERE id = ?`,
      [organizationId]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    console.error('Failed to cancel Stripe subscription', error);
    return NextResponse.json({ error: 'Unable to cancel subscription' }, { status: 500 });
  }
}