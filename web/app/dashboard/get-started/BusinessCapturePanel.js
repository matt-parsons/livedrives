'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';

const STATUS = {
  idle: 'idle',
  loading: 'loading',
  ready: 'ready',
  error: 'error',
  missing: 'missing'
};

export default function BusinessCapturePanel({ business, businessHref }) {
  const router = useRouter();
  const [status, setStatus] = useState(STATUS.idle);
  const [error, setError] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const businessId = business?.id ?? null;
  const placeId = business?.gPlaceId ?? null;

  useEffect(() => {
    if (!businessId) {
      return;
    }

    if (!placeId) {
      setStatus(STATUS.missing);
      setError('We need a Google Place ID to fetch your profile. The form will fill it in automatically when you search.');
      return;
    }

    let isActive = true;
    const controller = new AbortController();

    const fetchData = async () => {
      setStatus(STATUS.loading);
      setError('');

      try {
        const response = await fetch('/api/optimization-data', {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ placeId, businessId })
        });

        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(payload.error || 'Failed to capture your business data.');
        }

        if (!isActive) {
          return;
        }

        setStatus(STATUS.ready);
      } catch (fetchError) {
        if (!isActive) {
          return;
        }

        if (controller.signal.aborted) {
          return;
        }

        setError(fetchError.message || 'Unable to reach DataForSEO. Try again shortly.');
        setStatus(STATUS.error);
      }
    };

    fetchData();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [businessId, placeId, retryKey]);

  useEffect(() => {
    if (status === STATUS.ready && businessHref) {
      const timer = setTimeout(() => router.replace(businessHref), 800);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [status, businessHref, router]);

  const handleRetry = () => {
    setRetryKey((value) => value + 1);
  };

  const renderContent = () => {
    if (status === STATUS.loading || status === STATUS.idle) {
      return (
        <div className="flex items-start gap-3">
          <span className="h-4 w-4 animate-spin rounded-full border border-border border-t-transparent" />
          <div>
            <p className="text-sm font-semibold text-foreground">We&apos;re grabbing your GBP info</p>
            <p className="text-sm text-muted-foreground">
              Hold tight while we capture your Google Business Profile from DataForSEO.
            </p>
          </div>
        </div>
      );
    }

    if (status === STATUS.error) {
      return (
        <div className="space-y-3 text-sm">
          <p className="font-semibold text-destructive">We ran into an issue</p>
          <p className="text-muted-foreground">{error}</p>
          <Button onClick={handleRetry}>Try again</Button>
        </div>
      );
    }

    if (status === STATUS.missing) {
      return (
        <div className="space-y-3 text-sm">
          <p className="font-semibold text-foreground">Just a moment</p>
          <p className="text-muted-foreground">
            We&apos;re waiting on the Google Place ID to finish capturing your data. Continue editing the business
            entry if it is still loading.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-1 text-sm text-muted-foreground">
        <p className="font-semibold text-foreground">Profile synced</p>
        <p>Redirecting you to the dashboard now.</p>
      </div>
    );
  };

  return (
    <div className="rounded-lg border border-border/60 bg-background/40 p-4 shadow-sm">
      {renderContent()}
    </div>
  );
}
