'use client';

import Link from 'next/link';
import SummaryMetricCard from './SummaryMetricCard';
import { buildRunTrendIndicator } from './trendIndicators';

function formatPercent(value) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return '—';
  }

  return `${Math.round(numeric)}%`;
}

export default function ReviewPreview({ snapshot, reviewsHref }) {
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

  return (
    <section className="surface-card surface-card--muted latest-geogrid-card" aria-labelledby="review-preview-heading">
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
          We are still gathering review data for this business. Connect your Google Business Profile or check back shortly to
          unlock review insights.
        </div>
      )}
    </section>
  );
}
