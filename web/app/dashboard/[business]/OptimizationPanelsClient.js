'use client';

import { useEffect, useRef, useState } from 'react';
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

const MAX_POSTS_POLL_MS = 120_000;
const MAX_POSTS_TASK_RESETS = 1;

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
  const [postsPollingStopped, setPostsPollingStopped] = useState(false);
  const postsPollingRef = useRef({
    lastTaskId: null,
    startedAt: 0,
    resetCount: 0,
    initialResetDone: false
  });
  const postsResettingRef = useRef(false);

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
      postsPollingRef.current = { lastTaskId: null, startedAt: 0, resetCount: 0, initialResetDone: false };
      if (postsPollingStopped) {
        setPostsPollingStopped(false);
      }
      return undefined;
    }

    let isMounted = true;
    const controllers = new Set();

    const resetPostsTask = async () => {
      if (postsResettingRef.current) {
        return;
      }

      postsResettingRef.current = true;
      const controller = new AbortController();
      controllers.add(controller);

      try {
        const params = new URLSearchParams({ placeId, forceRefresh: '1', resetPostsTask: '1' });
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
          setRefreshNotice({
            tone: 'warning',
            text: 'Sync is taking longer than expected. We started a fresh DataForSEO request.'
          });
          setPostsPollingStopped(false);
          const { resetCount, initialResetDone } = postsPollingRef.current;
          postsPollingRef.current = {
            lastTaskId: null,
            startedAt: 0,
            resetCount,
            initialResetDone
          };
        }
      } catch (err) {
        if (!controller.signal.aborted && isMounted) {
          setRefreshNotice({
            tone: 'warning',
            text: 'Sync is taking longer than expected. Try refreshing again in a few minutes.'
          });
          setPostsPollingStopped(true);
        }
      } finally {
        controllers.delete(controller);
        postsResettingRef.current = false;
      }
    };

    const pollPostsCompletion = async () => {
      if (!isMounted || !meta?.postsTaskId || postsPollingStopped || postsResettingRef.current) {
        return;
      }

      const now = Date.now();
      if (!postsPollingRef.current.initialResetDone) {
        postsPollingRef.current.initialResetDone = true;
        postsPollingRef.current.startedAt = now;
        resetPostsTask();
        return;
      }

      if (postsPollingRef.current.lastTaskId !== meta.postsTaskId) {
        postsPollingRef.current.lastTaskId = meta.postsTaskId;
        postsPollingRef.current.startedAt = now;
      } else if (!postsPollingRef.current.startedAt) {
        postsPollingRef.current.startedAt = now;
      }

      if (now - postsPollingRef.current.startedAt > MAX_POSTS_POLL_MS) {
        if (postsPollingRef.current.resetCount < MAX_POSTS_TASK_RESETS) {
          postsPollingRef.current.resetCount += 1;
          postsPollingRef.current.startedAt = now;
          resetPostsTask();
        } else {
          setPostsPollingStopped(true);
          setRefreshNotice({
            tone: 'warning',
            text: 'Sync is taking longer than expected. Try refreshing again later.'
          });
        }
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
  }, [placeId, businessId, meta?.sidebarPending, meta?.postsTaskId, postsPollingStopped]);
  
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
  const isEnsuringLatestData = Boolean(refreshing || (meta?.sidebarPending && !postsPollingStopped));
  const statusLabel = loading
    ? '…'
    : error
      ? 'Needs attention'
      : profileHealth.statusLabel;
  const statusColor = loading
    ? '#64748b'
    : error
      ? '#dc2626'
      : profileHealth.statusLabel === 'Strong'
        ? '#16a34a'
        : profileHealth.statusLabel === 'Healthy'
          ? '#0f766e'
          : profileHealth.statusLabel === 'Competitive'
            ? '#2563eb'
            : '#f97316';
  const healthChecklist = [
    {
      id: 'headline',
      text: profileHealth.headline,
      tone: 'success'
    },
    {
      id: 'reinforcement',
      text: profileHealth.reinforcement,
      tone: 'success'
    },
    {
      id: 'next-focus',
      text: profileHealth.nextFocus,
      tone: 'focus'
    }
  ];

  return (
    <>
      <section className="section business-dashboard__hero">
        <div className="business-dashboard__top-row">
          <div className="business-dashboard__optimization-row">
            <div
              className="surface-card surface-card--muted dashboard-optimization-card">
              <div className="section-header">
                <div>
                  <h2 className="section-title" style={{ fontSize: '1.45rem', fontWeight: 700 }}>
                    Profile Health
                  </h2>
                  <p
                    className="section-caption"
                    style={{ fontSize: '0.95rem', marginTop: '0.35rem', color: '#64748b' }}
                  >
                    {profileHealth.headline}
                  </p>
                </div>
                <div className="dashboard-optimization-card__scores">
                  <div>
                    <strong style={{ fontSize: '1.7rem', fontWeight: 700, color: statusColor }}>
                      {statusLabel}
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
                    <div className="dashboard-optimization-card__meta" style={{ gap: '0.9rem', fontSize: '0.92rem' }}>
                      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.85rem' }}>
                        {healthChecklist.map((item) => {
                          const isFocus = item.tone === 'focus';
                          const iconStyle = {
                            width: '1.35rem',
                            height: '1.35rem',
                            borderRadius: '999px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            flexShrink: 0,
                            color: isFocus ? '#0284c7' : '#ffffff',
                            background: isFocus ? '#ffffff' : '#22c55e',
                            border: isFocus ? '2px solid #38bdf8' : '1px solid #22c55e'
                          };

                          return (
                            <li key={item.id} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                              <span style={iconStyle} aria-hidden="true">
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  width="14"
                                  height="14"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="3"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              </span>
                              <span style={{ color: '#0f172a', lineHeight: 1.5 }}>
                                {isFocus ? (
                                  <>
                                    <strong style={{ color: '#0f172a' }}>Next focus:</strong>{' '}
                                    <span style={{ color: '#64748b' }}>{item.text}</span>
                                  </>
                                ) : (
                                  item.text
                                )}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '1rem',
                          flexWrap: 'wrap',
                          color: '#64748b',
                          fontSize: '0.85rem'
                        }}
                      >
                        <span>Last checked: {lastRefreshedLabel}.</span>
                        {placeId && isAdmin ? (
                          <button
                            type="button"
                            onClick={handleRefreshClick}
                            disabled={refreshDisabled}
                            className="dashboard-optimization-card__refresh"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.4rem',
                              background: 'transparent',
                              border: 'none',
                              padding: 0,
                              fontSize: '0.9rem',
                              fontWeight: 600,
                              color: refreshDisabled ? '#94a3b8' : '#1d4ed8'
                            }}
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="18"
                              height="18"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <path d="M3 12a9 9 0 0 1 15.7-5.7L21 9" />
                              <path d="M21 3v6h-6" />
                              <path d="M21 12a9 9 0 0 1-15.7 5.7L3 15" />
                              <path d="M3 21v-6h6" />
                            </svg>
                            {refreshing ? 'Refreshing…' : 'Refresh data'}
                          </button>
                        ) : null}
                      </div>
                      {refreshNotice ? (
                        <p
                          className={`dashboard-optimization-card__notice dashboard-optimization-card__notice--${refreshNotice.tone}`}
                          style={{ fontWeight: 500 }}
                        >
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
                <div
                  className="dashboard-optimization-card__status-indicator"
                  role="status"
                  aria-live="polite"
                  style={{
                    position: 'static',
                    marginTop: '1.25rem',
                    width: '100%',
                    justifyContent: 'flex-start',
                    background: '#f8fafc',
                    border: '1px solid rgba(148, 163, 184, 0.3)',
                    color: '#64748b',
                    fontSize: '0.85rem',
                    padding: '0.65rem 0.95rem'
                  }}
                >
                  <span className="dashboard-optimization-card__spinner" aria-hidden="true" />
                  <span>Making sure we have the latest data…</span>
                </div>
              ) : null}
            </div>



            <div
              className="surface-card surface-card--muted dashboard-optimization-card">
              <div>
                <h2 className="section-title" style={{ fontSize: '1.35rem', fontWeight: 700 }}>
                  Ready to improve your ranking?
                </h2>
                <p style={{ marginTop: '0.65rem', color: '#64748b', lineHeight: 1.6, fontSize: '0.95rem' }}>
                  We&apos;ve analyzed your profile and created a personalized roadmap to help you rank higher in local
                  search.
                </p>
              </div>
              <div className="dashboard-optimization-card__cta" style={{ justifyContent: 'flex-start', marginTop: '1.5rem' }}>
                <Link
                  className="cta-link"
                  href={summaryLink}
                  style={{
                    background: '#f97316',
                    color: '#ffffff',
                    boxShadow: '0 10px 20px rgba(249, 115, 22, 0.25)',
                    padding: '0.85rem 1.75rem',
                    borderRadius: '18px'
                  }}
                >
                  Fix Ranking Issues
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
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
