"use client";

import { useEffect, useState } from 'react';

export default function UpgradeStripeSync({ sessionId }) {
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!sessionId) {
      return undefined;
    }

    let isCancelled = false;

    const syncSubscription = async () => {
      setStatus('loading');
      setError(null);

      try {
        const response = await fetch('/api/stripe/subscription', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId })
        });

        if (!response.ok) {
          const errorPayload = await response.json().catch(() => ({}));
          throw new Error(errorPayload.error || 'Unable to confirm subscription.');
        }

        if (!isCancelled) {
          setStatus('success');
        }
      } catch (err) {
        if (!isCancelled) {
          console.error('Failed to sync subscription', err);
          setError(err?.message ?? 'Failed to sync subscription.');
          setStatus('error');
        }
      }
    };

    syncSubscription();

    return () => {
      isCancelled = true;
    };
  }, [sessionId]);

  if (!sessionId || status === 'idle') {
    return null;
  }

  return (
    <div className="rounded border border-slate-200 bg-white/40 px-4 py-3 text-sm text-slate-800 shadow-sm">
      {status === 'loading' ? 'Finalizing your upgrade…' : null}
      {status === 'success' ? 'Subscription updated successfully.' : null}
      {status === 'error' && error ? <span className="text-red-600">{error}</span> : null}
    </div>
  );
}
