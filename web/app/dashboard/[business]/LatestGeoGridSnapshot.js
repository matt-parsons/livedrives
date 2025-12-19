'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import GeoGridMap from './runs/[runId]/GeoGridMap';
import SummaryMetricCard from './SummaryMetricCard';
import { buildMapPoints, resolveCenter } from './runs/formatters';

export default function LatestGeoGridSnapshot({
  businessId = null,
  apiKey = null,
  center = null,
  points = [],
  summary = null,
  keywordsHref = null,
  nextRankingReportLabel = null,
  lastRankingReportLabel = null
}) {
  const router = useRouter();
  const [livePoints, setLivePoints] = useState(() => (Array.isArray(points) ? points : []));
  const [liveCenter, setLiveCenter] = useState(() => center ?? null);
  const [liveStatus, setLiveStatus] = useState(() => summary?.status ?? null);
  const [pollError, setPollError] = useState(null);
  const lastRefreshRef = useRef(0);

  const runId = summary?.id ?? null;
  const hasMap = Boolean(apiKey && liveCenter && Array.isArray(livePoints) && livePoints.length > 0);
  const solvLabel = summary?.solvLabel ?? '—';
  const avgLabel = summary?.avgLabel ?? '—';
  const runDateLabel = summary?.runDate ?? 'No runs yet';
  const keywordLabel = summary?.keyword ?? '';
  const hasKeyword = Boolean(keywordLabel?.trim());
  const statusKey = liveStatus?.key ?? summary?.status?.key ?? 'unknown';
  const isReportGenerating = statusKey === 'in_progress' || statusKey === 'pending';

  useEffect(() => {
    setLivePoints(Array.isArray(points) ? points : []);
    setLiveCenter(center ?? null);
    setLiveStatus(summary?.status ?? null);
    setPollError(null);
    lastRefreshRef.current = 0;
  }, [runId, center, points, summary?.status]);

  const progress = useMemo(() => {
    const total = Number(summary?.totalPoints ?? livePoints.length ?? 0);
    const scanned = Array.isArray(livePoints)
      ? livePoints.filter((point) => Boolean(point?.measuredAt)).length
      : 0;
    const safeTotal = Number.isFinite(total) && total > 0 ? total : 0;
    const safeScanned = Number.isFinite(scanned) && scanned > 0 ? scanned : 0;
    const percent = safeTotal > 0 ? Math.min(100, Math.round((safeScanned / safeTotal) * 100)) : 0;

    return {
      total: safeTotal,
      scanned: safeScanned,
      percent
    };
  }, [summary?.totalPoints, livePoints]);

  useEffect(() => {
    if (!businessId || !runId || !isReportGenerating) {
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    const resolveStatus = (status) => {
      if (!status) {
        return { key: 'unknown', label: 'Unknown' };
      }

      const value = status.toString();
      const lower = value.toLowerCase();

      if (lower.includes('done') || lower.includes('complete')) {
        return { key: 'completed', label: 'Completed' };
      }

      if (lower.includes('error') || lower.includes('fail')) {
        return { key: 'failed', label: 'Failed' };
      }

      if (lower.includes('queue') || lower.includes('pend') || lower.includes('schedule')) {
        return { key: 'pending', label: 'Pending' };
      }

      if (lower.includes('progress') || lower.includes('running')) {
        return { key: 'in_progress', label: 'In progress' };
      }

      return { key: 'unknown', label: value.replace(/_/g, ' ') };
    };

    const poll = async () => {
      const now = Date.now();
      if (now - lastRefreshRef.current < 4500) {
        return;
      }

      lastRefreshRef.current = now;
      setPollError(null);

      try {
        const response = await fetch(
          `/api/businesses/${encodeURIComponent(businessId)}/geo-grid/runs/${encodeURIComponent(runId)}`,
          { method: 'GET', cache: 'no-store', signal: controller.signal }
        );

        const payload = await response.json().catch(() => ({}));

        if (!response.ok || payload?.error) {
          throw new Error(payload?.error || 'Unable to refresh ranking report.');
        }

        const run = payload?.run ?? null;
        const pointsRaw = Array.isArray(payload?.points) ? payload.points : [];
        const nextMapPoints = buildMapPoints(pointsRaw);
        const nextCenter = run ? resolveCenter(run, nextMapPoints) : null;
        const nextStatus = resolveStatus(run?.status);

        if (cancelled) {
          return;
        }

        setLivePoints(nextMapPoints);
        if (nextCenter) {
          setLiveCenter(nextCenter);
        }
        setLiveStatus(nextStatus);

        const nextTotal = Number(run?.totalPoints ?? nextMapPoints.length ?? 0);
        const nextScanned = nextMapPoints.filter((point) => Boolean(point?.measuredAt)).length;
        const isComplete = nextStatus.key === 'completed' || (nextTotal > 0 && nextScanned >= nextTotal);

        if (isComplete) {
          router.refresh();
        }
      } catch (error) {
        if (!cancelled && error?.name !== 'AbortError') {
          setPollError(error?.message || 'Unable to refresh ranking report.');
        }
      }
    };

    poll();
    const interval = setInterval(poll, 5000);

    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(interval);
    };
  }, [businessId, runId, isReportGenerating, router]);

  const summaryCards = [
    {
      id: 'avg',
      title: 'Average position',
      valueLabel: avgLabel,
      indicator: summary?.avgTrendIndicator ?? null,
      deltaLabel: summary?.avgDeltaLabel ?? null
    },
    {
      id: 'solv',
      title: 'SoLV (Top 3)',
      valueLabel: solvLabel,
      indicator: summary?.solvTrendIndicator ?? null,
      deltaLabel: summary?.solvDeltaLabel ?? null
    }
  ];

  return (
    <div className="dashboard-layout__sub-content">
    <div className="business-dashboard__optimization-row">
      {summaryCards.map((card) => (
        <div key={card.id}>
        {card.valueLabel !== '—' ? ( 
        <SummaryMetricCard
          key={card.id}
          title={card.title}
          valueLabel={card.valueLabel}
          indicator={card.indicator}
          deltaLabel={card.deltaLabel}
        />
        ) : null}
        </div>
      ))}
    </div>
    <section className="surface-card surface-card--muted latest-geogrid-card">
      {hasKeyword ? (
        <>
          <div className="latest-geogrid-card__status-row">
            <div>
              <div className="section-title">Your Latest Ranking Heat Map</div>
              <span className="latest-geogrid-card__keyword">Keyword: <span className="strong">&quot;{keywordLabel}&quot;</span></span>
            </div>
            {keywordsHref ? (
              <Link className="cta-link" href={keywordsHref}>
                View keyword insights ↗
              </Link>
            ) : null}
          </div>

          <div className="latest-geogrid-card__map">
            {hasMap ? (
              <>
                <GeoGridMap
                  apiKey={apiKey}
                  center={liveCenter}
                  points={livePoints}
                  interactive={false}
                  selectedPointId={null}
                  minHeight="clamp(220px, 35vw, 320px)"
                  unknownRankVariant={isReportGenerating ? 'loading' : 'unknown'}
                />
                {isReportGenerating ? (
                  <div className="latest-geogrid-card__map-overlay">
                    <div>
                      <p className="latest-geogrid-card__map-overlay-title">
                        Ranking report in progress
                      </p>
                      <p className="latest-geogrid-card__map-overlay-copy">
                        Scanned {progress.scanned}{progress.total ? ` of ${progress.total}` : ''} points{progress.total ? ` (${progress.percent}%)` : ''}.
                      </p>
                      <div className="latest-geogrid-card__progress" aria-hidden="true">
                        <span className="latest-geogrid-card__progress-spinner" />
                        <div className="latest-geogrid-card__progress-bar">
                          <div
                            className="latest-geogrid-card__progress-fill"
                            style={{ width: `${progress.percent}%` }}
                          />
                        </div>
                      </div>
                      {pollError ? (
                        <p className="latest-geogrid-card__map-overlay-copy">
                          {pollError}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="latest-geogrid-card__placeholder">
                <p>
                  {summary
                    ? 'Local ranking report map preview unavailable.'
                    : "We're running your your first ranking report now, once it is done it will unlock this map preview."}
                </p>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="latest-geogrid-card__empty-state">
          <p>
            Confirm your keyword you want to track and check back here for the first ranking report.
          </p>
        </div>
      )}
          {(lastRankingReportLabel || nextRankingReportLabel) ? (
            <div className="latest-geogrid-card__run-info">
              {lastRankingReportLabel ? (
                <p>
                  Last ranking report ran <strong>{lastRankingReportLabel}</strong>.
                </p>
              ) : null}
              {nextRankingReportLabel ? (
                <p>
                  Next ranking report will be recorded <strong>{nextRankingReportLabel}</strong>.
                </p>
              ) : null}
            </div>
          ) : null}
    </section>
    </div>
  );
}
