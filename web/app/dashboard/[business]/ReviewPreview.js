'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import SummaryMetricCard from './SummaryMetricCard';
import { buildRunTrendIndicator } from './trendIndicators';

function formatPercent(value) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return '—';
  }

  return `${Math.round(numeric)}%`;
}

export default function ReviewPreview({
  businessId = null,
  snapshot: initialSnapshot,
  dataForSeoPending: initialDataForSeoPending = false,
  reviewsHref
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot ?? null);
  const [dataForSeoPending, setDataForSeoPending] = useState(Boolean(initialDataForSeoPending));
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    setSnapshot(initialSnapshot ?? null);
    setDataForSeoPending(Boolean(initialDataForSeoPending));
  }, [businessId, initialSnapshot, initialDataForSeoPending]);

  useEffect(() => {
    if (!businessId || !dataForSeoPending) {
      return undefined;
    }

    let isMounted = true;
    const controller = new AbortController();

    const poll = async () => {
      if (!isMounted || controller.signal.aborted) return;

      setSyncing(true);
      try {
        const statusRes = await fetch(`/api/businesses/${businessId}/reviews/status`, {
          method: 'GET',
          signal: controller.signal,
          cache: 'no-store'
        });
        const statusPayload = await statusRes.json().catch(() => ({}));
        if (!statusRes.ok) {
          throw new Error(statusPayload?.error || `Request failed with status ${statusRes.status}`);
        }

        if (!statusPayload?.isComplete) {
          return;
        }

        const latestRes = await fetch(`/api/businesses/${businessId}/reviews/latest?forceRefresh=1`, {
          method: 'GET',
          signal: controller.signal,
          cache: 'no-store'
        });
        const latestPayload = await latestRes.json().catch(() => ({}));
        if (!latestRes.ok) {
          throw new Error(latestPayload?.error || `Request failed with status ${latestRes.status}`);
        }

        if (isMounted) {
          setSnapshot(latestPayload?.snapshot ?? null);
          setDataForSeoPending(Boolean(latestPayload?.dataForSeoPending));
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error('Review preview polling failed', error);
        }
      } finally {
        if (isMounted) {
          setSyncing(false);
        }
      }
    };

    poll();
    const intervalId = setInterval(poll, 5_000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
      controller.abort();
    };
  }, [businessId, dataForSeoPending]);

  const isEnsuringLatestData = Boolean(syncing || dataForSeoPending);
  const hasSnapshot = Boolean(snapshot);
  const totalReviewsLabel =
    hasSnapshot && Number.isFinite(snapshot?.totalReviewCount)
      ? snapshot.totalReviewCount.toLocaleString()
      : '—';
  const newReviews = hasSnapshot ? snapshot.newReviewsThisWeek : null;
  const lastWeekReviews = hasSnapshot ? snapshot.lastWeekReviews : null;
  const reviewDelta =
    newReviews !== null && newReviews !== undefined &&
    lastWeekReviews !== null &&
    lastWeekReviews !== undefined
      ? Number(newReviews) - Number(lastWeekReviews)
      : null;
  const reviewIndicator = buildRunTrendIndicator(reviewDelta, { unit: '', digits: 0 });
  const ratingCurrent = hasSnapshot ? Number(snapshot?.averageRating?.current) : null;
  const ratingPrevious = hasSnapshot ? Number(snapshot?.averageRating?.previous) : null;
  const ratingIndicator = buildRunTrendIndicator(
    ratingCurrent !== null && ratingCurrent !== undefined &&
      ratingPrevious !== null &&
      ratingPrevious !== undefined
      ? ratingCurrent - ratingPrevious
      : null,
    { unit: '', digits: 2 }
  );
  const ratingLabel =
    Number.isFinite(ratingCurrent) && ratingCurrent > 0 ? `${ratingCurrent.toFixed(1)} ★` : '—';
  const sentiment = snapshot?.sentiment ?? null;
  const sentimentBreakdown = [
    { id: 'positive', label: 'Positive', value: sentiment?.positive },
    { id: 'neutral', label: 'Neutral', value: sentiment?.neutral },
    { id: 'negative', label: 'Negative', value: sentiment?.negative }
  ].filter((entry) => Number.isFinite(Number(entry.value)));
  const sentimentSummary = sentiment?.summary ?? 'Sentiment insights will appear once reviews are synced.';

  const statusIndicator = useMemo(() => {
    if (!isEnsuringLatestData) return null;
    return (
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(255, 255, 255, 0.7)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 10
        }}
      >
        <div className="dashboard-optimization-card__status-indicator" role="status" aria-live="polite">
          <span className="dashboard-optimization-card__spinner" aria-hidden="true" />
          <span>Making sure we have the latest data…</span>
        </div>
      </div>
    );
  }, [isEnsuringLatestData]);

  return (
    <section
      className="surface-card surface-card--muted latest-geogrid-card"
      aria-labelledby="review-preview-heading"
      style={{ position: 'relative' }}
    >
      {statusIndicator}
      <div className="section-header">
        <div>
          <h2 id="review-preview-heading" className="section-title">
            Reviews preview
          </h2>
          <p className="section-caption">Monitor reputation momentum alongside your ranking progress.</p>
        </div>
        {reviewsHref ? (
          <Link className="cta-link" href={reviewsHref}>
            Open reviews ↗
          </Link>
        ) : null}
      </div>

      {hasSnapshot ? (
        <>
          <div className="latest-geogrid-card__stats">
            <SummaryMetricCard title="Total reviews" valueLabel={totalReviewsLabel} indicator={null} deltaLabel={null} />
            <SummaryMetricCard
              title="New reviews this week"
              valueLabel={newReviews !== null && newReviews !== undefined ? `${newReviews}` : '—'}
              indicator={reviewIndicator}
              deltaLabel={
                lastWeekReviews !== null && lastWeekReviews !== undefined ? `vs ${lastWeekReviews} last week` : null
              }
            />
            <SummaryMetricCard
              title="Average rating trend"
              valueLabel={ratingLabel}
              indicator={ratingIndicator}
              deltaLabel={
                Number.isFinite(ratingPrevious)
                  ? `from ${ratingPrevious.toFixed(1)} prior period`
                  : null
              }
            />
          </div>

          <div className="mt-5 rounded-xl border border-border/60 bg-white/70 p-4 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-foreground">Sentiment snapshot</p>
                <p className="text-sm text-muted-foreground">{sentimentSummary}</p>
              </div>
            </div>

            {sentimentBreakdown.length ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {sentimentBreakdown.map((entry) => (
                  <div key={entry.id} className="rounded-lg bg-muted/60 p-3 text-sm text-foreground">
                    <p className="font-semibold">{entry.label}</p>
                    <p className="text-muted-foreground">{formatPercent(entry.value)}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </>
      ) : (
        <div className="dashboard-optimization-card__message" style={{ marginTop: '0.5rem' }}>
          We are still gathering review data for this business. Connect your Google Business Profile or check back
          shortly to unlock review insights.
        </div>
      )}
    </section>
  );
}
