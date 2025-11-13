'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import LatestGeoGridSnapshot from './LatestGeoGridSnapshot';
import NextStepsPanel from './NextStepsPanel';
import { resolveLetterGrade } from './optimization';

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

function selectNextOptimizationSteps(roadmap, limit = 3) {
  if (!roadmap || !Array.isArray(roadmap.tasks)) {
    return [];
  }

  return roadmap.tasks
    .filter((task) => task.status && task.status.key !== 'completed')
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
    .slice(0, limit);
}

export default function OptimizationPanelsClient({
  placeId,
  businessId,
  optimizationHref,
  canManageSettings,
  editHref,
  mapPoints = [],
  mapCenter = null,
  mapsApiKey = null,
  latestRunSummary = null,
  keywordsHref = null,
  ctrHref = null
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

  const nextManualRefreshDate = meta?.nextManualRefreshAt
    ? new Date(meta.nextManualRefreshAt)
    : null;
  const manualCooldownActive = Boolean(
    nextManualRefreshDate && nextManualRefreshDate.getTime() > Date.now()
  );
  const manualCooldownLabel = manualCooldownActive
    ? formatTimestamp(nextManualRefreshDate)
    : null;
  const lastRefreshedLabel = meta?.lastRefreshedAt
    ? formatTimestamp(meta.lastRefreshedAt)
    : 'Not yet refreshed';
  const refreshDisabled = !placeId || refreshing || loading || manualCooldownActive;

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
                  Let's get you to 100% and improve your rankings!
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

  const optimizationGrade = roadmap ? resolveLetterGrade(roadmap.progressPercent) : null;
  const optimizationSteps = selectNextOptimizationSteps(roadmap);

  const summaryLink = optimizationHref ?? '#';
  const automationLink = ctrHref ?? '#';

  return (
    <>
      <section className="section business-dashboard__hero">
        <div className="business-dashboard__top-row">
          <LatestGeoGridSnapshot
            apiKey={mapsApiKey}
            center={mapCenter}
            points={mapPoints}
            summary={latestRunSummary}
            keywordsHref={keywordsHref}
          />
          <div className="business-dashboard__optimization-column">
            <div className="surface-card surface-card--muted dashboard-optimization-card">
              <div className="section-header">
                <div>
                  <h2 className="section-title">Overall Progress</h2>
                  <p className="section-caption">Complete all tasks to maximize your ranking potential</p>
                </div>
                <div className="dashboard-optimization-card__scores">
                  <div>
                    {loading ? (
                      <strong>0%</strong>
                    ) : error ? (
                      <strong>0%</strong>
                    ) : roadmap ? (
                      <strong>{roadmap.progressPercent}%</strong>
                    ) : (
                      <strong>0%</strong>
                    )}
                  </div>
                </div>
              </div>

              {loading ? (
                <p className="dashboard-optimization-card__message">Gathering data… check back in a moment.</p>
              ) : error ? (
                <div className="inline-error" role="status" style={{ marginTop: '0.75rem' }}>
                  <strong>We're having trouble gathering your data</strong>
                  <span>{error}</span>
                </div>
              ) : roadmap ? (
                <div className="dashboard-optimization-card__content">
                  <div className="dashboard-optimization-card__progress">
                    <div
                      style={{
                        width: `${Math.min(100, Math.max(0, roadmap.progressPercent))}%`
                      }}
                    />
                  </div>
                <div className="dashboard-optimization-card__actions">
                  {placeId ? (
                    <button
                      type="button"
                      onClick={handleRefreshClick}
                      disabled={refreshDisabled}
                      className="dashboard-optimization-card__refresh"
                    >
                      {refreshing ? 'Refreshing…' : 'Refresh data'}
                    </button>
                  ) : null}
                </div>

                  <div className="dashboard-optimization-card__meta">
                    <p>
                      {manualCooldownActive
                        ? `Next manual refresh available ${manualCooldownLabel}.`
                        : 'You can refresh this data once per day when needed.'}
                    </p>
                    <p>Last refreshed {lastRefreshedLabel}.</p>
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
            </div>

            <div className="surface-card surface-card--muted automation-cta">
              <div className="automation-cta__icon" aria-hidden="true">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-zap w-6 h-6 text-white" data-source-location="components/dashboard/CTRBanner:25:10" data-dynamic-content="false"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"></path></svg>
              </div>
              <div className="automation-cta__info">
                <strong>Automated CTR Optimization Active</strong>
                <p>
                  Our AI is continuously improving your click-through rate in the background. No action needed.{' '}
                  <Link href={automationLink}>Click here to learn more.</Link>
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <NextStepsPanel
        steps={optimizationSteps}
        optimizationHref={optimizationHref}
        loading={loading}
        error={error}
      />
    </>
  );
}
