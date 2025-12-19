"use client";

import { useState } from 'react';

export default function UpgradeCheckoutButton({ priceId, buttonTxt = 'Start for Free' }) {
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
    <div className="flex w-full flex-col items-center gap-2">
      <button
        type="button"
        onClick={handleCheckout}
        disabled={loading}
        className="group flex w-full items-center justify-center gap-3 rounded-xl border border-blue-600 bg-white px-6 py-4 text-base font-semibold text-blue-600 shadow-sm transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span>{loading ? 'Redirecting…' : buttonTxt}</span>
        {loading ? null : (
          <svg
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5 transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          >
            <path
              d="M3.75 10H16.25"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M11.25 5L16.25 10L11.25 15"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
