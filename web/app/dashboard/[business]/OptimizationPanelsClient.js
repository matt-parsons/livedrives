'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import LatestGeoGridSnapshot from './LatestGeoGridSnapshot';
import NextStepsPanel from './NextStepsPanel';
import SummaryMetricCard from './SummaryMetricCard';
import { resolveProfileHealthSummary, selectNextOptimizationSteps } from './optimization';
import { buildRunTrendIndicator } from './trendIndicators';
import BusinessAiOverviewCard from './BusinessAiOverviewCard';

function formatTimestamp(value) {
  if (!value) {
    return 'Not yet refreshed';
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return typeof value === 'string' ? value : 'Not yet refreshed';
  }

  try {
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(date);
  } catch (error) {
    return date.toISOString();
  }
}

export default function OptimizationPanelsClient({
  placeId,
  businessId,
  businessName,
  optimizationHref,
  canManageSettings,
  editHref,
  mapPoints = [],
  mapCenter = null,
  mapsApiKey = null,
  latestRunSummary = null,
  keywordsHref = null,
  ctrHref = null,
  isAdmin = false,
  nextRankingReportLabel = null,
  lastRankingReportLabel = null,
  snapshot,
  dataForSeoPending,
  reviewsHref,
  aiOverviewReady
}) {
  const [loading, setLoading] = useState(Boolean(placeId));
  const [error, setError] = useState(null);
  const [roadmap, setRoadmap] = useState(null);
  const [meta, setMeta] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNotice, setRefreshNotice] = useState(null);

  useEffect(() => {
    if (!placeId) {
      setLoading(false);
      setError(null);
      setRoadmap(null);
      setMeta(null);
      setRefreshNotice(null);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);
    setRoadmap(null);
    setRefreshNotice(null);

    const controller = new AbortController();
    const fetchData = async () => {
      try {
        const params = new URLSearchParams({ placeId });
        if (businessId) {
          params.set('businessId', String(businessId));
        }

        const response = await fetch(`/api/optimization-data?${params.toString()}`, {
          method: 'GET',
          signal: controller.signal,
          cache: 'no-store'
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || `Request failed with status ${response.status}`);
        }

        const payload = await response.json();
        if (isMounted) {
          setRoadmap(payload?.data?.roadmap ?? null);
          setMeta(payload?.data?.meta ?? null);
          setError(null);
        }
      } catch (err) {
        if (!controller.signal.aborted && isMounted) {
          setError(err.message || 'Failed to load optimization data.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [placeId, businessId]);

  useEffect(() => {
    if (!placeId || !meta?.sidebarPending) {
      return undefined;
    }

    let isMounted = true;
    const controllers = new Set();

    const pollPostsCompletion = async () => {
      if (!isMounted || !meta?.postsTaskId) {
        return;
      }

      const controller = new AbortController();
      controllers.add(controller);

      try {
        const response = await fetch(`/api/places/posts-status/${meta.postsTaskId}`, {
          method: 'GET',
          signal: controller.signal,
          cache: 'no-store'
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data?.error || `Request failed with status ${response.status}`);
        }

        if (!data?.isComplete) {
          return;
        }

        const params = new URLSearchParams({ placeId, forceRefresh: '1' });
        if (businessId) {
          params.set('businessId', String(businessId));
        }

        const refreshed = await fetch(`/api/optimization-data?${params.toString()}`, {
          method: 'GET',
          signal: controller.signal,
          cache: 'no-store'
        });

        const payload = await refreshed.json().catch(() => ({}));
        if (!refreshed.ok) {
          throw new Error(payload?.error || `Request failed with status ${refreshed.status}`);
        }

        if (isMounted) {
          setRoadmap(payload?.data?.roadmap ?? null);
          setMeta(payload?.data?.meta ?? null);
          setError(null);
        }
      } catch (err) {
        if (!controller.signal.aborted && isMounted) {
          console.error('Posts polling failed', err);
        }
      } finally {
        controllers.delete(controller);
      }
    };

    const pollSidebarData = async () => {
      if (!isMounted) {
        return;
      }

      const controller = new AbortController();
      controllers.add(controller);

      try {
        const params = new URLSearchParams({ placeId });
        if (businessId) {
          params.set('businessId', String(businessId));
        }

        const response = await fetch(`/api/optimization-data?${params.toString()}`, {
          method: 'GET',
          signal: controller.signal,
          cache: 'no-store'
        });

        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(payload?.error || `Request failed with status ${response.status}`);
        }

        if (isMounted) {
          setRoadmap(payload?.data?.roadmap ?? null);
          setMeta(payload?.data?.meta ?? null);
          setError(null);
        }
      } catch (err) {
        if (!controller.signal.aborted && isMounted) {
          console.error('Sidebar polling failed', err);
        }
      } finally {
        controllers.delete(controller);
      }
    };

    const intervalMs = meta?.postsTaskId ? 5_000 : 15_000;
    const intervalId = setInterval(meta?.postsTaskId ? pollPostsCompletion : pollSidebarData, intervalMs);
    (meta?.postsTaskId ? pollPostsCompletion : pollSidebarData)();

    return () => {
      isMounted = false;
      clearInterval(intervalId);
      controllers.forEach((controller) => controller.abort());
    };
  }, [placeId, businessId, meta?.sidebarPending, meta?.postsTaskId]);
  
  const hasSnapshot = Boolean(snapshot);
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
    

  const nextManualRefreshDate = meta?.nextManualRefreshAt
    ? new Date(meta.nextManualRefreshAt)
    : null;
  const manualCooldownActive =
    !isAdmin &&
    Boolean(nextManualRefreshDate && nextManualRefreshDate.getTime() > Date.now());
  const manualCooldownLabel = manualCooldownActive
    ? formatTimestamp(nextManualRefreshDate)
    : null;
  const lastRefreshedLabel = meta?.lastRefreshedAt
    ? formatTimestamp(meta.lastRefreshedAt)
    : 'Not yet refreshed';
  const refreshDisabled = !placeId || refreshing || loading || manualCooldownActive;
  const manualRefreshHelper = isAdmin
    ? 'Admins can refresh this data without waiting between attempts.'
    : manualCooldownActive
      ? `Next manual refresh available ${manualCooldownLabel}.`
      : 'You can refresh this data once per day when needed.';

  const handleRefreshClick = async () => {
    if (!placeId || refreshing) {
      return;
    }

    setRefreshNotice(null);
    setRefreshing(true);

    try {
      const response = await fetch('/api/optimization-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ placeId, businessId })
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (payload?.nextAllowedAt) {
          setMeta((previous) => {
            const base = previous ?? {};
            return { ...base, nextManualRefreshAt: payload.nextAllowedAt };
          });
        }

        throw new Error(payload?.error || `Request failed with status ${response.status}`);
      }

      setRoadmap(payload?.data?.roadmap ?? null);
      setMeta(payload?.data?.meta ?? null);
      setError(null);
      setRefreshNotice({
        tone: 'success',
        text: 'Google Business Profile data was refreshed just now.'
      });
    } catch (err) {
      setRefreshNotice({
        tone: 'error',
        text: err?.message || 'Unable to refresh Google data right now.'
      });
    } finally {
      setRefreshing(false);
    }
  };

  if (!placeId) {
    return (
      <>
        <section className="section">
          <div className="surface-card surface-card--muted surface-card--compact">
            <div className="section-header">
              <div>
                <h2 className="section-title">Next steps to improve your profile</h2>
                <p className="section-caption">
                  Focus on these tasks to strengthen your local visibility.
                </p>
              </div>
              <Link className="cta-link" href={optimizationHref}>
                Explore full roadmap ↗
              </Link>
            </div>

            <p style={{ marginTop: '0.75rem', color: '#6b7280' }}>
              Connect your Google Business Profile to unlock personalized recommendations.
            </p>
          </div>
        </section>

        <section className="section">
          <div className="surface-card surface-card--muted">
            <div className="section-header">
              <div>
                <h2 className="section-title">Overall Progress</h2>
                <p className="section-caption">
                  Let&apos;s strengthen your profile health and improve your rankings.
                </p>
              </div>
              <Link className="cta-link" href={optimizationHref}>
                View full checklist ↗
              </Link>
            </div>

            <div style={{ marginTop: '0.75rem' }}>
              <p style={{ color: '#6b7280', marginBottom: '0.75rem' }}>
                Connect a Google Place ID to unlock automated profile scoring and guidance.
              </p>
              {canManageSettings ? (
                <Link className="cta-link" href={editHref}>
                  Add Google Place ID ↗
                </Link>
              ) : null}
            </div>
          </div>
        </section>
      </>
    );
  }

  const optimizationSteps = selectNextOptimizationSteps(roadmap);
  const profileHealth = resolveProfileHealthSummary(roadmap?.progressPercent);

  const summaryLink = optimizationHref ?? '#';
  const automationLink = ctrHref ?? '#';
  const isEnsuringLatestData = Boolean(refreshing || meta?.sidebarPending);

  return (
    <>
      <section className="section business-dashboard__hero">
        <div className="business-dashboard__top-row">
          <div className="business-dashboard__optimization-row">
            <div className="surface-card surface-card--muted dashboard-optimization-card">
              <div className="section-header">
                <div>
                  <h2 className="section-title">Profile Health</h2>
                  <p className="section-caption">{profileHealth.headline}</p>
                </div>
                <div className="dashboard-optimization-card__scores">
                  <div>
                    <strong>
                      {loading
                        ? 'Checking…'
                        : error
                          ? 'Needs attention'
                          : profileHealth.statusLabel}
                    </strong>
                  </div>
                </div>
              </div>

                {loading ? (
                  <p className="dashboard-optimization-card__message">Gathering data… check back in a moment.</p>
                ) : error ? (
                  <div className="inline-error" role="status" style={{ marginTop: '0.75rem' }}>
                    <strong>We&apos;re having trouble gathering your data</strong>
                    <span>{error}</span>
                  </div>
                ) : roadmap ? (
                  <div className="dashboard-optimization-card__content">
                    {profileHealth.showProgressBar ? (
                      <div className="dashboard-optimization-card__progress" aria-label="Profile health momentum">
                        <div
                          style={{
                            width: `${Math.min(100, Math.max(0, profileHealth.progressFill ?? 0))}%`
                          }}
                        />
                      </div>
                    ) : null}
                    <div className="dashboard-optimization-card__meta">
                      <p className="dashboard-optimization-card__message">{profileHealth.headline}</p>
                      <p className="dashboard-optimization-card__notice">{profileHealth.reinforcement}</p>
                      <p className="dashboard-optimization-card__notice">
                        <strong>Next focus:</strong> {profileHealth.nextFocus}
                      </p>
                      <p className="dashboard-optimization-card__notice">
                        <span>Last checked: {lastRefreshedLabel}.</span>
                        {placeId && isAdmin ? (
                          <button
                            type="button"
                            onClick={handleRefreshClick}
                            disabled={refreshDisabled}
                            className="dashboard-optimization-card__refresh"
                          >
                            {refreshing ? 'Refreshing…' : 'Refresh data'}
                          </button>
                        ) : null}
                      </p>
                      {refreshNotice ? (
                        <p className={`dashboard-optimization-card__notice dashboard-optimization-card__notice--${refreshNotice.tone}`}>
                          {refreshNotice.text}
                        </p>
                      ) : null}
                      {meta?.warning ? (
                        <p className="dashboard-optimization-card__notice dashboard-optimization-card__notice--warning">
                          {meta.warning}
                        </p>
                      ) : null}

                    </div>
                  </div>
                ) : (
                  <p className="dashboard-optimization-card__message">
                    We could not compute optimization insights for this profile yet.
                  </p>
                )}

              {isEnsuringLatestData ? (
                <div className="dashboard-optimization-card__status-indicator" role="status" aria-live="polite">
                  <span className="dashboard-optimization-card__spinner" aria-hidden="true" />
                  <span>Making sure we have the latest data…</span>
                </div>
              ) : null}
            </div>


            <SummaryMetricCard
              title="30d Average rating trend"
              valueLabel={ratingLabel}
              indicator={ratingIndicator}
              deltaLabel={
                Number.isFinite(ratingPrevious)
                  ? `from ${ratingPrevious.toFixed(1)} prior period`
                  : null
              }
            />

            <div className="surface-card surface-card--muted dashboard-optimization-card__actions">
              <div>
                <h2 className="section-title">GBP Optimization Tasks</h2>
                <span>You have recommended tasks to improve your Google Business Profile ranking</span>
              </div>
              <div className="dashboard-optimization-card__cta">
                <Link className="cta-link" href={summaryLink}>
                  Fix Ranking Issues ↗
                </Link>
              </div>   
            </div>

         
            {/* <div className="surface-card surface-card--muted automation-cta">
              <div className="automation-cta__icon" aria-hidden="true">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" data-dynamic-content="false"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"></path></svg>
              </div>
              <div className="automation-cta__info">
                <strong>Automated CTR Optimization Active</strong>
                <p>
                  Our AI is continuously improving your click-through rate in the background. No action needed.{' '}
                </p>
              </div>
            </div> */}
          </div>
        </div>
          {aiOverviewReady && placeId ? (
            <BusinessAiOverviewCard
              placeId={placeId}
              businessName={businessName}
              isReady={aiOverviewReady}
            />
          ) : null}


      </section>
      <LatestGeoGridSnapshot
        businessId={businessId}
        apiKey={mapsApiKey}
        center={mapCenter}
        points={mapPoints}
        summary={latestRunSummary}
        keywordsHref={keywordsHref}
        nextRankingReportLabel={nextRankingReportLabel}
        lastRankingReportLabel={lastRankingReportLabel}
      />

    </>
  );
}
