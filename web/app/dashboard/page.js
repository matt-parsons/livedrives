import { DateTime } from 'luxon';
import { BusinessLayoutProvider } from './[business]/BusinessLayoutContext';
import BusinessNavigation from './[business]/BusinessNavigation';
import SidebarBrand from './[business]/SidebarBrand';
import DashboardBusinessHeader from './[business]/DashboardBusinessHeader';
import KeywordSelectionModal from './[business]/KeywordSelectionModal';
import {
  formatDate,
  formatDecimal,
  toTimestamp,
  loadGeoGridRunSummaries,
  loadGeoGridRunWithPoints,
  loadOriginZones,
  loadGeoGridSchedule
} from './[business]/helpers';
import { buildRunTrendIndicator } from './[business]/trendIndicators';
import { buildMapPoints, resolveCenter } from './[business]/runs/formatters';
import OptimizationPanelsClient from './[business]/OptimizationPanelsClient';
import KeywordOriginZoneForm from './get-started/KeywordOriginZoneForm';
import { ensureGbpAccessToken } from '@/lib/googleBusinessProfile';
import { loadReviewSnapshot } from './[business]/reviews/reviewSnapshot';
import ReviewPreview from './[business]/ReviewPreview';
import RankingAiOverviewCard from './[business]/RankingAiOverviewCard';
import { resolveDashboardBusinessContext } from './businessContext';

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

function formatRankingReportDate(value, timezone) {
  if (!value) {
    return null;
  }

  try {
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: timezone || 'UTC'
    }).format(new Date(value));
  } catch (error) {
    return new Date(value).toLocaleString();
  }
}

function parseLocalTime(value) {
  if (!value || typeof value !== 'string') {
    return null;
  }

  const match = value.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) {
    return null;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return null;
  }

  return {
    hour,
    minute
  };
}

function computeNextScheduledRunDate(dayOfWeek, timeOfDay, timezone) {
  if (!dayOfWeek || !timeOfDay) {
    return null;
  }

  const parsed = parseLocalTime(timeOfDay);

  if (!parsed) {
    return null;
  }

  const zone = timezone || 'UTC';
  const now = DateTime.now().setZone(zone);
  const targetWeekday = Number(dayOfWeek);

  if (!Number.isFinite(targetWeekday)) {
    return null;
  }

  let candidate = now
    .set({ hour: parsed.hour, minute: parsed.minute, second: 0, millisecond: 0 })
    .plus({ days: (targetWeekday + 7 - now.weekday) % 7 });

  if (candidate <= now) {
    candidate = candidate.plus({ days: 7 });
  }

  return candidate.toJSDate();
}

function mapRunRecord(run) {
  const totalPoints = Number(run.totalPoints ?? 0);
  const rankedPoints = Number(run.rankedPoints ?? 0);
  const top3Points = Number(run.top3Points ?? 0);
  const avgRank = run.avgRank === null || run.avgRank === undefined ? null : Number(run.avgRank);
  const lastMeasuredAt = toTimestamp(run.lastMeasuredAt);
  const runDate = toTimestamp(run.finishedAt) ?? lastMeasuredAt ?? toTimestamp(run.createdAt);

  const solvValue = rankedPoints > 0 ? (top3Points * 100) / rankedPoints : null;
  const solvLabel = solvValue === null ? null : formatDecimal(solvValue, 1);

  return {
    id: run.id,
    keyword: run.keyword,
    runDate,
    runDateValue: runDate ? new Date(runDate) : null,
    status: resolveStatus(run.status),
    totalPoints,
    top3Points,
    avgRank,
    avgLabel: avgRank === null ? null : formatDecimal(avgRank, 2),
    solvLabel,
    lastMeasuredAt
  };
}

function buildRunHref(runId, businessId) {
  if (!runId || !businessId) {
    return null;
  }

  const params = new URLSearchParams({ bId: String(businessId) });
  return `/dashboard/runs/${runId}?${params.toString()}`;
}

function summarizeLatestRun(runs, businessId) {
  if (!Array.isArray(runs) || runs.length === 0) {
    return null;
  }

  const sorted = [...runs].sort((a, b) => {
    if (!a?.runDateValue && !b?.runDateValue) {
      return 0;
    }

    if (!a?.runDateValue) {
      return 1;
    }

    if (!b?.runDateValue) {
      return -1;
    }

    return b.runDateValue - a.runDateValue;
  });

  const latest = sorted[0];

  if (!latest) {
    return null;
  }

  const status = latest.status;
  const runDateLabel = latest.runDate ? formatDate(latest.runDate) : null;
  const solvLabel = latest.solvLabel ?? '0';
  const avgLabel = latest.avgLabel ?? '0';

  const previous = sorted.find((entry) => entry.id !== latest.id) ?? null;

  const avgDelta = previous && previous.avgRank !== null && latest.avgRank !== null
    ? latest.avgRank - previous.avgRank
    : null;
  const solvDelta = previous && previous.top3Points !== null && latest.top3Points !== null
    ? ((latest.top3Points ?? 0) - (previous.top3Points ?? 0)) / (previous.top3Points || 1) * 100
    : null;

  const avgDeltaAbs = avgDelta !== null ? formatDecimal(Math.abs(avgDelta), 2) : null;
  const avgDeltaLabel =
    avgDeltaAbs !== null ? `${avgDelta > 0 ? '+' : avgDelta < 0 ? '-' : ''}${avgDeltaAbs}` : null;
  const solvDeltaAbs = solvDelta !== null ? formatDecimal(Math.abs(solvDelta), 1) : null;
  const solvDeltaLabel =
    solvDeltaAbs !== null ? `${solvDelta > 0 ? '+' : solvDelta < 0 ? '-' : ''}${solvDeltaAbs}%` : null;

  const avgTrendIndicator = buildRunTrendIndicator(avgDelta, { invert: true, digits: 2 });
  const solvTrendIndicator = buildRunTrendIndicator(solvDelta, { unit: '%', digits: 1 });

  return {
    id: latest.id ?? null,
    keyword: latest.keyword || '(no keyword)',
    runDate: runDateLabel ?? '—',
    runDateValue: latest.runDateValue ?? null,
    status,
    totalPoints: latest.totalPoints ?? 0,
    top3Points: latest.top3Points ?? 0,
    solvLabel,
    avgLabel,
    avgDeltaLabel,
    solvDeltaLabel,
    avgTrendIndicator,
    solvTrendIndicator,
    href: buildRunHref(latest.id, businessId)
  };
}

export default async function DashboardPage({ searchParams }) {
  const { session, business, layoutContextValue } = await resolveDashboardBusinessContext({
    searchParams
  });

  if (!business || !layoutContextValue) {
    return null;
  }

  const businessIdentifier = business.businessSlug ?? String(business.id);
  const keywordsHref = `/dashboard/keywords?bId=${encodeURIComponent(business.id)}`;
  const optimizationHref = `/dashboard/optimization-steps?bId=${encodeURIComponent(business.id)}`;
  const editHref = `/dashboard/${encodeURIComponent(businessIdentifier)}/edit`;
  const ctrHref = `/dashboard/ctr?bId=${encodeURIComponent(business.id)}`;
  const reviewsHref = `/dashboard/reviews?bId=${encodeURIComponent(business.id)}`;

  const [originZones, geoGridRunsRaw, gbpAccessToken, geoGridSchedule] = await Promise.all([
    loadOriginZones(business.id),
    loadGeoGridRunSummaries(business.id),
    ensureGbpAccessToken(business.id),
    loadGeoGridSchedule(business.id)
  ]);
  const primaryOriginZone = originZones[0] ?? null;
  const hasSelectedKeyword = Array.isArray(primaryOriginZone?.keywords)
    ? primaryOriginZone.keywords.length > 0
    : Boolean(primaryOriginZone?.keywords);

  const isAdmin = session.role === 'admin';
  const canManageSettings = isAdmin;

  const geoGridRuns = geoGridRunsRaw.map(mapRunRecord);
  const latestRunSummary = summarizeLatestRun(geoGridRuns, business.id);
  const latestRunDetails =
    latestRunSummary && latestRunSummary.id
      ? await loadGeoGridRunWithPoints(business.id, latestRunSummary.id)
      : null;
  const mapPoints = latestRunDetails?.points ? buildMapPoints(latestRunDetails.points) : [];
  const mapCenter = latestRunDetails ? resolveCenter(latestRunDetails.run ?? {}, mapPoints) : null;
  const mapsApiKey =
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? process.env.GOOGLE_API_KEY ?? null;
  const { snapshot: reviewSnapshot, dataForSeoPending: reviewPending } = await loadReviewSnapshot(
    business,
    gbpAccessToken
  );
  const nextRunSource =
    geoGridSchedule?.nextRunAt ??
    computeNextScheduledRunDate(
      geoGridSchedule?.dayOfWeek,
      geoGridSchedule?.startTimeLocal,
      business.timezone
    );
  const nextRankingReportLabel = formatRankingReportDate(nextRunSource, business.timezone);
  const lastRankingReportLabel = formatRankingReportDate(
    latestRunSummary?.runDateValue ?? geoGridSchedule?.lastRunAt,
    business.timezone
  );

  const aiOverviewReady = hasSelectedKeyword && Boolean(reviewSnapshot) && !reviewPending;

  return (
    <BusinessLayoutProvider value={layoutContextValue}>
      <div className="dashboard-layout">
        <div className="dashboard-layout__body">
          <aside className="dashboard-layout__sidebar" aria-label="Workspace navigation">
            <SidebarBrand />
            <div className="dashboard-sidebar__menu">
              <BusinessNavigation businessId={business.id} active="dashboard" />
            </div>
          </aside>

          <main className="dashboard-layout__main">
            <DashboardBusinessHeader organizationId={session.organizationId} />
            <div className="dashboard-layout__content">
              <KeywordSelectionModal
                hasSelectedKeyword={hasSelectedKeyword}
                business={business}
                primaryOriginZone={primaryOriginZone}
              />

              {hasSelectedKeyword && (
                <div className="section-header latest-geogrid-card__header">
                  <div>
                    <h2 className="section-title">What would you like to work on today?</h2>

                    <p className="section-caption">
                      Review your freshest keyword coverage snapshot across the map.
                    </p>

                    <div className="section-caption">
                      <span>Last Report Run: </span>
                      <strong>{latestRunSummary?.runDate ?? 'No runs yet'}</strong>
                    </div>
                  </div>
                </div>
              )}
              {hasSelectedKeyword && (
                <OptimizationPanelsClient
                  placeId={business.gPlaceId ?? null}
                  businessId={business.id}
                  businessName={business.businessName}
                  optimizationHref={optimizationHref}
                  canManageSettings={canManageSettings}
                  isAdmin={isAdmin}
                  editHref={editHref}
                  mapPoints={mapPoints}
                  mapCenter={mapCenter}
                  mapsApiKey={mapsApiKey}
                  latestRunSummary={latestRunSummary}
                  keywordsHref={keywordsHref}
                  ctrHref={ctrHref}
                  nextRankingReportLabel={nextRankingReportLabel}
                  lastRankingReportLabel={lastRankingReportLabel}
                  snapshot={reviewSnapshot}
                  dataForSeoPending={reviewPending}
                  reviewsHref={reviewsHref}
                  aiOverviewReady={aiOverviewReady}
                />
              )}
              {hasSelectedKeyword && (
                <ReviewPreview
                  businessId={business.id}
                  snapshot={reviewSnapshot}
                  dataForSeoPending={reviewPending}
                  reviewsHref={reviewsHref}
                />
              )}

              {!hasSelectedKeyword && (
                <div className="section">
                  <div className="surface-card surface-card--muted">
                    <div className="section-header">
                      <div>
                        <h2 className="section-title">Set your first keyword</h2>
                        <p className="section-caption">
                          Start tracking rankings by adding at least one keyword for this business.
                        </p>
                      </div>
                    </div>

                    <KeywordOriginZoneForm
                      businessId={business.id}
                      gPlaceId={business.gPlaceId}
                      defaultKeywords={[]}
                      defaultOriginZone={null}
                      showActions={false}
                    />
                  </div>
                </div>
              )}

              {hasSelectedKeyword && (
                <RankingAiOverviewCard
                  businessId={business.id}
                  lastRankingReportLabel={lastRankingReportLabel}
                  nextRankingReportLabel={nextRankingReportLabel}
                  aiOverviewReady={aiOverviewReady}
                />
              )}
            </div>
          </main>
        </div>
      </div>
    </BusinessLayoutProvider>
  );
}
