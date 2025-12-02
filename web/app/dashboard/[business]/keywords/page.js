import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AuthError, requireAuth } from '@/lib/authServer';
import GeoGridRunsSection from '../GeoGridRunsSection';
import KeywordPerformanceSpotlight from '../KeywordPerformanceSpotlight';
import BusinessNavigation from '../BusinessNavigation';
import SidebarBrand from '../SidebarBrand';
import DashboardBusinessHeader from '../DashboardBusinessHeader';
import {
  formatDate,
  formatDecimal,
  formatTrend,
  toTimestamp,
  loadBusiness,
  loadGeoGridRunSummaries,
  loadGeoGridRunWithPoints,
  loadCtrKeywordOverview
} from '../helpers';
import { buildRunTrendIndicator } from '../trendIndicators';
import { buildMapPoints, resolveCenter } from '../runs/formatters';

export const metadata = {
  title: 'Keywords · Local Paint Pilot'
};

function resolveMapsApiKey() {
  return process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? process.env.GOOGLE_API_KEY ?? null;
}

function resolveStatus(status) {
  if (!status) {
    return { key: 'unknown', label: 'Unknown' };
  }

  const value = status.toString();
  const lower = value.toLowerCase();

  if (lower.includes('complete')) {
    return { key: 'completed', label: 'Completed' };
  }

  if (lower.includes('progress') || lower.includes('running')) {
    return { key: 'in_progress', label: 'Needs Improvement' };
  }

  if (lower.includes('fail') || lower.includes('error')) {
    return { key: 'failed', label: 'Failed' };
  }

  if (lower.includes('pend') || lower.includes('queue') || lower.includes('schedule')) {
    return { key: 'pending', label: 'Pending' };
  }

  return { key: 'unknown', label: value.replace(/_/g, ' ') };
}

function formatCoordinate(value, digits = 5) {
  if (value === null || value === undefined) {
    return null;
  }

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return String(value);
  }

  return formatDecimal(numericValue, digits);
}

function buildCoordinatePair(lat, lng, digits = 5) {
  const latFormatted = formatCoordinate(lat, digits);
  const lngFormatted = formatCoordinate(lng, digits);

  if (!latFormatted || !lngFormatted) {
    return null;
  }

  return `${latFormatted}, ${lngFormatted}`;
}

export default async function BusinessKeywordsPage({ params, searchParams }) {
  const identifier = params.business;
  const viewMode = searchParams?.view === 'list' ? 'list' : 'trend';
  const baseHref = `/dashboard/${encodeURIComponent(identifier)}`;
  const ctrHref = `${baseHref}/ctr`;

  let session;

  try {
    session = await requireAuth();
  } catch (error) {
    if (error instanceof AuthError && error.statusCode >= 400 && error.statusCode < 500) {
      redirect('/signin');
    }

    throw error;
  }

  const business = await loadBusiness(session, identifier);

  if (!business) {
    notFound();
  }

  const canViewCtr = session.role === 'owner' || session.role === 'admin';

  const businessName = business.businessName || 'Business dashboard';
  const businessIdentifier = business.businessSlug ?? String(business.id);

  const ctrOverview = await loadCtrKeywordOverview(business.id, 30);
  const geoGridRunsRaw = await loadGeoGridRunSummaries(business.id);

  const geoGridRuns = geoGridRunsRaw.map((run) => {
    const rankedPoints = Number(run.rankedPoints ?? 0);
    const top3Points = Number(run.top3Points ?? 0);
    const avgPositionValue = run.avgRank === null || run.avgRank === undefined ? null : Number(run.avgRank);
    const avgPosition = avgPositionValue === null ? null : formatDecimal(avgPositionValue, 2);
    const solvValue = rankedPoints > 0 ? (top3Points * 100) / rankedPoints : null;
    const solvTop3 = solvValue === null ? null : formatDecimal(solvValue, 1);
    const runDateValue = run.finishedAt ?? run.lastMeasuredAt ?? run.createdAt;
    const lastMeasuredAtValue = run.lastMeasuredAt ?? null;
    const finishedAtValue = run.finishedAt ?? null;
    const createdAtValue = run.createdAt ?? null;

    return {
      ...run,
      rankedPoints,
      top3Points,
      avgPositionValue,
      avgPosition,
      solvTop3Value: solvValue,
      solvTop3,
      runDateValue,
      runDate: formatDate(runDateValue),
      lastMeasuredAtValue,
      lastMeasuredAt: formatDate(lastMeasuredAtValue),
      finishedAtValue,
      finishedAt: formatDate(finishedAtValue),
      createdAtValue,
      createdAt: formatDate(createdAtValue)
    };
  });

  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const nowTimestamp = Date.now();
  const recentKeywordRuns = new Map();

  for (const run of geoGridRuns) {
    const timestamp = toTimestamp(run.runDateValue);

    if (!timestamp || nowTimestamp - timestamp > THIRTY_DAYS_MS) {
      continue;
    }

    const keywordLabel = run.keyword ?? '(no keyword)';
    const key = keywordLabel.trim().toLowerCase() || '__no_keyword__';

    if (!recentKeywordRuns.has(key)) {
      recentKeywordRuns.set(key, []);
    }

    recentKeywordRuns.get(key).push({ run, timestamp });
  }

  const keywordPerformance30d = Array.from(recentKeywordRuns.entries())
    .map(([key, entries]) => {
      const sorted = entries.slice().sort((a, b) => a.timestamp - b.timestamp);
      const firstEntry = sorted[0];
      const latestEntry = sorted[sorted.length - 1];
      const firstRun = firstEntry.run;
      const latestRun = latestEntry.run;
      const firstAvg = firstRun.avgPositionValue ?? null;
      const latestAvg = latestRun.avgPositionValue ?? null;
      const firstSolv = firstRun.solvTop3Value ?? null;
      const latestSolv = latestRun.solvTop3Value ?? null;
      const avgDelta = firstAvg !== null && latestAvg !== null ? latestAvg - firstAvg : null;
      const solvDelta = firstSolv !== null && latestSolv !== null ? latestSolv - firstSolv : null;
      const avgDeltaAbs = avgDelta !== null ? formatDecimal(Math.abs(avgDelta), 2) : null;
      const avgDeltaLabel =
        avgDeltaAbs !== null ? `${avgDelta > 0 ? '+' : avgDelta < 0 ? '-' : ''}${avgDeltaAbs}` : null;
      const solvDeltaAbs = solvDelta !== null ? formatDecimal(Math.abs(solvDelta), 1) : null;
      const solvDeltaLabel =
        solvDeltaAbs !== null ? `${solvDelta > 0 ? '+' : solvDelta < 0 ? '-' : ''}${solvDeltaAbs}%` : null;
      const chartPoints = sorted.map(({ run, timestamp }) => ({
        timestamp,
        label: run.runDate ?? formatDate(run.runDateValue),
        avgPosition: run.avgPositionValue ?? null,
        solvTop3: run.solvTop3Value ?? null
      }));

      return {
        key,
        keyword: latestRun.keyword || '(no keyword)',
        runCount: sorted.length,
        latestRunDate: latestRun.runDate ?? '—',
        latestRunId: latestRun.id ?? null,
        latestRunHref: latestRun.id ? `${baseHref}/runs/${latestRun.id}` : null,
        avgLabel: latestRun.avgPosition ?? '—',
        avgTrendIndicator: buildRunTrendIndicator(avgDelta, { invert: true, digits: 2 }),
        avgDeltaLabel,
        solvLabel: latestRun.solvTop3 ? `${latestRun.solvTop3}%` : '—',
        solvTrendIndicator: buildRunTrendIndicator(solvDelta, { unit: '%', digits: 1 }),
        solvDeltaLabel,
        latestTimestamp: latestEntry.timestamp,
        chartPoints
      };
    })
    .sort((a, b) => b.latestTimestamp - a.latestTimestamp)
    .map(({ latestTimestamp, ...rest }) => rest);

  const mapsApiKey = resolveMapsApiKey();
  const keywordPerformanceItems = keywordPerformance30d.length
    ? await Promise.all(
        keywordPerformance30d.map(async (item) => {
          if (!item.latestRunId || !mapsApiKey) {
            return { ...item, latestRunMap: null };
          }

          try {
            const runData = await loadGeoGridRunWithPoints(business.id, item.latestRunId);

            if (!runData) {
              return { ...item, latestRunMap: null };
            }

            const mapPoints = buildMapPoints(runData.points);
            const center = resolveCenter(runData.run, mapPoints);

            if (!center) {
              return { ...item, latestRunMap: null };
            }

            return {
              ...item,
              latestRunMap: {
                center,
                points: mapPoints
              }
            };
          } catch (error) {
            return { ...item, latestRunMap: null };
          }
        })
      )
    : [];

  const runTrendComparisons = new Map();
  const geoGridTrend = (() => {
    if (!geoGridRuns.length) {
      return [];
    }

    const grouped = new Map();

    for (const run of geoGridRuns) {
      const keywordLabel = run.keyword ?? '(no keyword)';
      const key = keywordLabel.trim().toLowerCase() || '__no_keyword__';

      if (!grouped.has(key)) {
        grouped.set(key, { key, label: keywordLabel, runs: [] });
      }

      grouped.get(key).runs.push(run);
    }

    const entries = Array.from(grouped.values()).map((entry) => {
      const runs = entry.runs.slice().sort((a, b) => toTimestamp(a.runDateValue) - toTimestamp(b.runDateValue));
      let previous = null;

      for (const run of runs) {
        let avgDeltaToPrevious = null;
        let solvDeltaToPrevious = null;

        if (previous) {
          if (
            run.avgPositionValue !== null &&
            run.avgPositionValue !== undefined &&
            previous.avgPositionValue !== null &&
            previous.avgPositionValue !== undefined
          ) {
            avgDeltaToPrevious = run.avgPositionValue - previous.avgPositionValue;
          }

          if (
            run.solvTop3Value !== null &&
            run.solvTop3Value !== undefined &&
            previous.solvTop3Value !== null &&
            previous.solvTop3Value !== undefined
          ) {
            solvDeltaToPrevious = run.solvTop3Value - previous.solvTop3Value;
          }
        }

        runTrendComparisons.set(run.id, {
          avgDelta: avgDeltaToPrevious,
          solvDelta: solvDeltaToPrevious
        });

        previous = run;
      }

      const first = runs[0];
      const latest = runs[runs.length - 1];
      const firstRunDateValue = first?.runDateValue ?? null;
      const latestRunDateValue = latest?.runDateValue ?? null;
      const firstAvg = first?.avgPositionValue ?? null;
      const latestAvg = latest?.avgPositionValue ?? null;
      const firstSolv = first?.solvTop3Value ?? null;
      const latestSolv = latest?.solvTop3Value ?? null;
      const avgDelta = firstAvg !== null && latestAvg !== null ? latestAvg - firstAvg : null;
      const solvDelta = firstSolv !== null && latestSolv !== null ? latestSolv - firstSolv : null;
      const avgTrendIndicator = buildRunTrendIndicator(avgDelta, { invert: true, digits: 2 });
      const solvTrendIndicator = buildRunTrendIndicator(solvDelta, { unit: '%', digits: 1 });

      return {
        key: entry.key,
        keyword: entry.label,
        runCount: runs.length,
        firstRunDate: formatDate(firstRunDateValue),
        latestRunDate: formatDate(latestRunDateValue),
        firstRunDateValue,
        latestRunDateValue,
        latestRunId: latest?.id ?? null,
        avgTrend: formatTrend(firstAvg, latestAvg, 2),
        avgFirst: firstAvg,
        avgLatest: latestAvg,
        avgDelta,
        solvTrend: formatTrend(firstSolv, latestSolv, 1, '%'),
        solvFirst: firstSolv,
        solvLatest: latestSolv,
        solvDelta,
        avgTrendIndicator,
        solvTrendIndicator,
        latestStatus: latest?.status ?? 'unknown'
      };
    });

    entries.sort((a, b) => toTimestamp(b.latestRunDateValue) - toTimestamp(a.latestRunDateValue));

    return entries.map(({ firstRunDateValue, latestRunDateValue, ...rest }) => rest);
  })();

  const geoSectionCaption = geoGridRuns.length === 0
    ? 'Launch your first ranking report to start seeing where your profile shows up.'
    : 'Switch between detailed runs and keyword trend arcs to track performance.';

  const trendMeta = {
    positive: { label: 'Improving', fg: '#1a7431', bg: 'rgba(26, 116, 49, 0.12)' },
    negative: { label: 'Declining', fg: '#b91c1c', bg: 'rgba(185, 28, 28, 0.12)' },
    neutral: { label: 'Stable', fg: '#4b5563', bg: 'rgba(75, 85, 99, 0.12)' }
  };

  const ctrOverviewRows = ctrOverview.map((item) => {
    const avgLabel = item.avgPosition != null ? formatDecimal(item.avgPosition, 2) : '—';
    const solvLabel = item.solvTop3 != null ? `${formatDecimal(item.solvTop3, 1)}%` : '—';

    const avgTrendConfig = trendMeta[item.avgTrend] ?? trendMeta.neutral;
    const avgDeltaLabel =
      item.avgDelta != null
        ? `${item.avgDelta > 0 ? '+' : item.avgDelta < 0 ? '-' : ''}${formatDecimal(Math.abs(item.avgDelta), 2)}`
        : null;
    const avgPillStyle = {
      backgroundColor: avgTrendConfig.bg,
      color: avgTrendConfig.fg
    };

    const solvTrendConfig = trendMeta[item.solvTrend] ?? trendMeta.neutral;
    const solvDeltaLabel =
      item.solvDelta != null
        ? `${item.solvDelta > 0 ? '+' : item.solvDelta < 0 ? '-' : ''}${formatDecimal(Math.abs(item.solvDelta), 1)}%`
        : null;
    const solvPillStyle = {
      backgroundColor: solvTrendConfig.bg,
      color: solvTrendConfig.fg
    };

    return {
      keyword: item.keyword,
      sessions: item.sessions,
      avgLabel,
      avgTrendLabel: avgTrendConfig.label,
      avgDeltaLabel,
      avgPillStyle,
      solvLabel,
      solvTrendLabel: solvTrendConfig.label,
      solvDeltaLabel,
      solvPillStyle
    };
  });

  const geoGridRunsList = geoGridRuns.map((run) => {
    const status = resolveStatus(run.status);
    const solvTop3 = run.solvTop3 ? `${run.solvTop3}%` : '—';
    const avgPosition = run.avgPosition ?? '—';
    const runDate = run.runDate ?? '—';
    const lastMeasured = run.lastMeasuredAt ? `Last point ${run.lastMeasuredAt}` : null;
    const gridDetails = [
      `Grid: ${run.gridRows ?? '—'} × ${run.gridCols ?? '—'}`,
      run.spacingMiles !== null && run.spacingMiles !== undefined
        ? `Spacing: ${formatDecimal(run.spacingMiles, 2) ?? run.spacingMiles} mi`
        : null,
      run.radiusMiles !== null && run.radiusMiles !== undefined
        ? `Radius: ${formatDecimal(run.radiusMiles, 2) ?? run.radiusMiles} mi`
        : null
    ].filter(Boolean);
    const footerDetails = [
      `Run ID: ${run.id}`,
      lastMeasured,
      run.originLat !== null && run.originLng !== null
        ? `Origin: ${buildCoordinatePair(run.originLat, run.originLng)}`
        : null,
      `Ranked points: ${run.rankedPoints ?? 0} of ${run.totalPoints ?? 0}`
    ].filter(Boolean);
    const trends = runTrendComparisons.get(run.id) ?? { avgDelta: null, solvDelta: null };
    const solvTrendIndicator = buildRunTrendIndicator(trends.solvDelta, { unit: '%', digits: 1 });
    const avgTrendIndicator = buildRunTrendIndicator(trends.avgDelta, { invert: true, digits: 2 });

    return {
      id: run.id,
      keyword: run.keyword || 'Untitled grid run',
      href: `${baseHref}/runs/${run.id}`,
      runDate,
      status,
      solvTop3,
      solvTrendIndicator,
      avgPosition,
      avgTrendIndicator,
      gridDetails,
      footerDetails,
      notes: run.notes || null
    };
  });

  const geoGridTrendList = geoGridTrend.map((item) => ({
    key: item.key,
    keyword: item.keyword,
    runCount: item.runCount,
    firstRunDate: item.firstRunDate,
    latestRunDate: item.latestRunDate,
    latestRunHref: item.latestRunId ? `${baseHref}/runs/${item.latestRunId}` : null,
    status: resolveStatus(item.latestStatus),
    avgTrendIndicator: item.avgTrendIndicator,
    solvTrendIndicator: item.solvTrendIndicator,
    avg: {
      first: item.avgFirst,
      latest: item.avgLatest,
      delta: item.avgDelta
    },
    solv: {
      first: item.solvFirst,
      latest: item.solvLatest,
      delta: item.solvDelta
    }
  }));

  return (
    <div className="dashboard-layout__body">
        <aside className="dashboard-layout__sidebar" aria-label="Workspace navigation">
          <SidebarBrand />
          <div className="dashboard-sidebar__menu">
            <BusinessNavigation businessIdentifier={businessIdentifier} active="keywords" />
          </div>
        </aside>

        <main className="dashboard-layout__main">
          <DashboardBusinessHeader />
          <div className="dashboard-layout__content">
            <div className="section-header">
              <div>
                <h2 className="section-title">Ranking Reports</h2>
                <p className="section-caption">
                  Track the local ranking performance for {businessName}.
                </p>
              </div>
            </div>

            <section className="section">
              <KeywordPerformanceSpotlight items={keywordPerformanceItems} mapsApiKey={mapsApiKey} />
            </section>

            <section className="section">
                <GeoGridRunsSection
                  caption={geoSectionCaption}
                  defaultView={viewMode}
                  trendItems={geoGridTrendList}
                  runItems={geoGridRunsList}
                />
            </section>

            {canViewCtr ? (
              <section className="section">
                <div className="surface-card surface-card--muted surface-card--compact">
                  <div className="section-header">
                    <h2 className="section-title">CTR sessions</h2>
                    <p className="section-caption">Analyze click-through behaviors alongside geo performance.</p>
                  </div>

                  {ctrOverviewRows.length ? (
                    <div
                      className="ctr-overview-list"
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.75rem',
                        marginTop: '1rem',
                        marginBottom: '1rem'
                      }}
                    >
                      {ctrOverviewRows.map((item) => (
                        <div
                          key={item.keyword}
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            alignItems: 'center',
                            gap: '1rem',
                            border: '1px solid rgba(17, 24, 39, 0.08)',
                            borderRadius: '12px',
                            padding: '0.85rem 1.1rem',
                            backgroundColor: '#ffffff'
                          }}
                        >
                          <div style={{ flex: '1 1 200px' }}>
                            <strong style={{ fontSize: '1rem' }}>{item.keyword}</strong>
                            <div style={{ color: '#6b7280', fontSize: '0.85rem', marginTop: '0.2rem' }}>
                              {item.sessions} session{item.sessions === 1 ? '' : 's'} (30 days)
                            </div>
                          </div>

                          <div
                            style={{
                              display: 'flex',
                              flexWrap: 'wrap',
                              gap: '1.25rem',
                              flex: '1 1 240px'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                              <span style={{ color: '#374151', fontSize: '0.9rem' }}>
                                Avg position{' '}
                                <strong style={{ fontSize: '1rem' }}>{item.avgLabel}</strong>
                              </span>
                              <span
                                style={{
                                  ...item.avgPillStyle,
                                  padding: '0.3rem 0.75rem',
                                  borderRadius: '999px',
                                  fontSize: '0.8rem',
                                  fontWeight: 600
                                }}
                              >
                                {item.avgTrendLabel}
                                {item.avgDeltaLabel ? (
                                  <span style={{ fontWeight: 500, opacity: 0.8 }}>
                                    {' '}({item.avgDeltaLabel})
                                  </span>
                                ) : null}
                              </span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                              <span style={{ color: '#374151', fontSize: '0.9rem' }}>
                                SoLV (Top 3){' '}
                                <strong style={{ fontSize: '1rem' }}>{item.solvLabel}</strong>
                              </span>
                              <span
                                style={{
                                  ...item.solvPillStyle,
                                  padding: '0.3rem 0.75rem',
                                  borderRadius: '999px',
                                  fontSize: '0.8rem',
                                  fontWeight: 600
                                }}
                              >
                                {item.solvTrendLabel}
                                {item.solvDeltaLabel ? (
                                  <span style={{ fontWeight: 500, opacity: 0.8 }}>
                                    {' '}({item.solvDeltaLabel})
                                  </span>
                                ) : null}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p style={{ marginTop: '1rem', color: '#6b7280' }}>
                      No CTR sessions recorded in the last 30 days.
                    </p>
                  )}

                  <Link className="cta-link" href={ctrHref}>
                    Open CTR dashboard ↗
                  </Link>
                </div>
              </section>
            ) : null}

          </div>
        </main>
      </div>
  );
}
