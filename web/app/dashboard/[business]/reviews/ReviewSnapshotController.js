'use client';

import { useEffect, useRef, useState } from 'react';
import ReviewOverview from './ReviewOverview';
import ReviewPendingNotice from './ReviewPendingNotice';
import ReviewPermissionsGate from './ReviewPermissionsGate';
import BusinessAiOverviewCard from '../BusinessAiOverviewCard';

const POLL_INTERVAL_MS = 5000;

export default function ReviewSnapshotController({
  initialSnapshot,
  initialDataForSeoPending,
  scheduledPosts,
  businessId,
  timezone,
  authorizationUrl,
  canSchedulePosts,
  canRefreshReviews,
  businessName,
  placeId
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [dataForSeoPending, setDataForSeoPending] = useState(
    !initialSnapshot && Boolean(initialDataForSeoPending)
  );
  const [pollError, setPollError] = useState(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    setSnapshot(initialSnapshot);
    setDataForSeoPending(!initialSnapshot && Boolean(initialDataForSeoPending));
  }, [initialSnapshot, initialDataForSeoPending]);

  useEffect(() => {
    if (!dataForSeoPending || snapshot) {
      return;
    }

    let cancelled = false;

    const fetchLatestSnapshot = async () => {
      try {
        const response = await fetch(`/api/businesses/${businessId}/reviews/latest`, {
          cache: 'no-store'
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => '');
          throw new Error(errorText || 'Failed to refresh review status.');
        }

        const payload = await response.json().catch(() => null);

        if (cancelled) {
          return;
        }

        if (payload?.snapshot) {
          setSnapshot(payload.snapshot);
          setDataForSeoPending(false);
          setPollError(null);
          return;
        }

        setDataForSeoPending(Boolean(payload?.dataForSeoPending));
        setPollError(null);
      } catch (error) {
        if (cancelled) {
          return;
        }

        setPollError(error?.message || 'Unable to refresh review status.');
      }
    };

    fetchLatestSnapshot();
    intervalRef.current = setInterval(fetchLatestSnapshot, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;

      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [businessId, dataForSeoPending, snapshot]);

  if (!snapshot && dataForSeoPending) {
    return (
      <div className="space-y-2">
        <ReviewPendingNotice />
        {pollError ? (
          <p className="text-sm text-red-700">{pollError}</p>
        ) : null}
      </div>
    );
  }

  if (!snapshot) {
    return <ReviewPermissionsGate authorizationUrl={authorizationUrl} />;
  }

  const aiOverviewReady = Boolean(snapshot && placeId);

  return (
    <div className="flex flex-col gap-6">
      {aiOverviewReady ? (
        <BusinessAiOverviewCard
          placeId={placeId}
          businessName={businessName}
          isReady={aiOverviewReady}
        />
      ) : null}

      <ReviewOverview
        snapshot={snapshot}
        scheduledPosts={scheduledPosts}
        businessId={businessId}
        timezone={timezone}
        authorizationUrl={authorizationUrl}
        canSchedulePosts={canSchedulePosts}
        canRefreshReviews={canRefreshReviews}
      />
    </div>
  );
}
