"use client";

import { useState } from 'react';

export default function UpgradeCheckoutButton({ priceId }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleCheckout = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId })
      });

      if (!response.ok) {
        throw new Error('Unable to start Stripe checkout.');
      }

      const { checkoutUrl } = await response.json();

      if (!checkoutUrl) {
        throw new Error('Checkout session was created without a redirect URL.');
      }

      window.location.href = checkoutUrl;
    } catch (err) {
      console.error('Failed to start checkout', err);
      setError(err?.message ?? 'Failed to start checkout.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={handleCheckout}
        disabled={loading}
        className="rounded bg-blue-600 px-6 py-3 text-white shadow hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {loading ? 'Redirecting…' : 'Upgrade with Stripe'}
      </button>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
