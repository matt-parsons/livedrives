import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { AuthError, requireAuth } from '@/lib/authServer';

function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }

  return new Stripe(secretKey, { apiVersion: '2024-06-20' });
}

export async function POST(request) {
  try {
    const session = await requireAuth();
    const stripe = getStripeClient();
    const body = await request.json();
    const priceId = body?.priceId || process.env.STRIPE_MO_PRICE_ID;

    if (!priceId) {
      return NextResponse.json({ error: 'Missing Stripe price configuration' }, { status: 400 });
    }

    const successUrl = `${process.env.APP_PRODUCTION_URL}/dashboard/upgrade?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${process.env.APP_PRODUCTION_URL}/dashboard/upgrade`;

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [
        {
          price: priceId,
          quantity: 1
        }
      ],
      customer_email: session.email,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        organizationId: session.organizationId,
        userId: session.userId
      }
    });

    return NextResponse.json({ checkoutUrl: checkoutSession.url, sessionId: checkoutSession.id });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    console.error('Failed to create Stripe checkout session', error);
    return NextResponse.json({ error: 'Unable to start checkout' }, { status: 500 });
  }
}
