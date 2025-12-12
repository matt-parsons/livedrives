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

async function updateOrganizationSubscription(organizationId, status, planId, renewsAt) {
  await pool.query(
    `UPDATE organizations
        SET subscription_status = ?,
            subscription_plan = ?,
            subscription_renews_at = ?
      WHERE id = ?`,
    [status ?? null, planId ?? null, renewsAt ?? null, organizationId]
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

    if (organizationId && String(organizationId) !== String(session.organizationId)) {
      return NextResponse.json({ error: 'Unauthorized organization update' }, { status: 403 });
    }

    const subscription =
      typeof checkoutSession.subscription === 'string'
        ? await stripe.subscriptions.retrieve(checkoutSession.subscription)
        : checkoutSession.subscription;

    const subscriptionStatus = subscription?.status ?? checkoutSession.status ?? null;
    const renewsAt = resolveRenewalDate(subscription);
    const planId = resolvePlanId(subscription);

    await updateOrganizationSubscription(session.organizationId, subscriptionStatus, planId, renewsAt);

    return NextResponse.json({
      subscriptionStatus,
      subscriptionPlan: planId,
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
