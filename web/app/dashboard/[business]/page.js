import { notFound, redirect } from 'next/navigation';
import { AuthError, requireAuth } from '@/lib/authServer';
import BusinessNavigation from './BusinessNavigation';
import SidebarBrand from './SidebarBrand';
import DashboardBusinessHeader from './DashboardBusinessHeader';
import {
  formatDate,
  formatDecimal,
  toTimestamp,
  loadBusiness,
  loadGeoGridRunSummaries,
  loadGeoGridRunWithPoints,
  loadOriginZones
} from './helpers';
import { buildRunTrendIndicator } from './trendIndicators';
import { buildMapPoints, resolveCenter } from './runs/formatters';
import OptimizationPanelsClient from './OptimizationPanelsClient';
import KeywordOriginZoneForm from '../get-started/KeywordOriginZoneForm';
import { ensureGbpAccessToken } from '@/lib/googleBusinessProfile';
import { loadReviewSnapshot } from './reviews/reviewSnapshot';
import ReviewPreview from './ReviewPreview';

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

function mapRunRecord(run) {
  const rankedPoints = Number(run.rankedPoints ?? 0);
  const top3Points = Number(run.top3Points ?? 0);
  const avgPositionValue =
    run.avgRank === null || run.avgRank === undefined ? null : Number(run.avgRank);
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
}

function summarizeLatestRun(runs, baseHref) {
  if (!Array.isArray(runs) || runs.length === 0) {
    return null;
  }

  const sorted = runs
    .slice()
    .sort((a, b) => toTimestamp(b.runDateValue) - toTimestamp(a.runDateValue));
  const latest = sorted[0];
  const previous = sorted[1] ?? null;

  const status = resolveStatus(latest.status);
  const solvLabel =
    latest.solvTop3Value === null || latest.solvTop3Value === undefined
      ? '—'
      : `${formatDecimal(latest.solvTop3Value, 1)}%`;
  const avgLabel =
    latest.avgPositionValue === null || latest.avgPositionValue === undefined
      ? '—'
      : formatDecimal(latest.avgPositionValue, 2);

  const avgDelta =
    latest.avgPositionValue !== null &&
    latest.avgPositionValue !== undefined &&
    previous?.avgPositionValue !== null &&
    previous?.avgPositionValue !== undefined
      ? Number(latest.avgPositionValue) - Number(previous.avgPositionValue)
      : null;
  const solvDelta =
    latest.solvTop3Value !== null &&
    latest.solvTop3Value !== undefined &&
    previous?.solvTop3Value !== null &&
    previous?.solvTop3Value !== undefined
      ? Number(latest.solvTop3Value) - Number(previous.solvTop3Value)
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
    runDate: latest.runDate ?? '—',
    status,
    totalPoints: latest.totalPoints ?? 0,
    top3Points: latest.top3Points ?? 0,
    solvLabel,
    avgLabel,
    avgDeltaLabel,
    solvDeltaLabel,
    avgTrendIndicator,
    solvTrendIndicator,
    href: latest.id ? `${baseHref}/runs/${latest.id}` : null
  };
}


export default async function BusinessDashboardPage({ params }) {
  const identifier = params.business;
  const baseHref = `/dashboard/${encodeURIComponent(identifier)}`;
  const keywordsHref = `${baseHref}/keywords`;
  const optimizationHref = `${baseHref}/optimization-steps`;
  const editHref = `${baseHref}/edit`;
  const ctrHref = `${baseHref}/ctr`;
  const reviewsHref = `${baseHref}/reviews`;

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

  const originZones = await loadOriginZones(business.id);
  const primaryOriginZone = originZones[0] ?? null;
  const hasSelectedKeyword = Array.isArray(primaryOriginZone?.keywords)
    ? primaryOriginZone.keywords.length > 0
    : Boolean(primaryOriginZone?.keywords);

  const isAdmin = session.role === 'admin';
  const canManageSettings = isAdmin;

  const geoGridRunsRaw = await loadGeoGridRunSummaries(business.id);
  const geoGridRuns = geoGridRunsRaw.map(mapRunRecord);
  const latestRunSummary = summarizeLatestRun(geoGridRuns, baseHref);
  const latestRunDetails =
    latestRunSummary && latestRunSummary.id
      ? await loadGeoGridRunWithPoints(business.id, latestRunSummary.id)
      : null;
  const mapPoints = latestRunDetails?.points ? buildMapPoints(latestRunDetails.points) : [];
  const mapCenter = latestRunDetails ? resolveCenter(latestRunDetails.run ?? {}, mapPoints) : null;
  const mapsApiKey =
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? process.env.GOOGLE_API_KEY ?? null;
  const gbpAccessToken = await ensureGbpAccessToken(business.id);
  const { snapshot: reviewSnapshot } = await loadReviewSnapshot(business, gbpAccessToken);

  const businessIdentifier = business.businessSlug ?? String(business.id);
  return (
    <div className="dashboard-layout__body">
      <aside className="dashboard-layout__sidebar" aria-label="Workspace navigation">
        <SidebarBrand />
        <div className="dashboard-sidebar__menu">
          <BusinessNavigation businessIdentifier={businessIdentifier} active="dashboard" />
        </div>
      </aside>

      <main className="dashboard-layout__main">
        <DashboardBusinessHeader />
        <div className="dashboard-layout__content">
          {!hasSelectedKeyword ? (
            <section className="rounded-2xl border border-border/60 bg-card/90 p-6 shadow-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Origin keyword</p>
                  <p className="text-lg font-semibold text-foreground">Confirm your keyword</p>
                  <p className="text-sm text-muted-foreground">
                    We'll pin the keyword to your business address with a 3 mile radius so rank tracking can begin.
                  </p>
                </div>
              </div>

              <div className="mt-4">
                <KeywordOriginZoneForm
                  businessId={business.id}
                  businessName={business.businessName}
                  destinationAddress={business.destinationAddress}
                  destinationZip={business.destinationZip}
                  destLat={business.destLat}
                  destLng={business.destLng}
                  existingZone={primaryOriginZone}
                />
              </div>
            </section>
          ) : null}

          <div className="section-header latest-geogrid-card__header">
            <div>
              <h2 className="section-title">Profile Overview</h2>

              <p className="section-caption">
                Review your freshest keyword coverage snapshot across the map.
              </p>

              <div className="section-caption">
                <span>Last Report Run: </span>
                <strong>{latestRunSummary?.runDate ?? 'No runs yet'}</strong>
              </div>
            </div>
          </div>
          <OptimizationPanelsClient
            placeId={business.gPlaceId ?? null}
            businessId={business.id}
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
          />
          <ReviewPreview snapshot={reviewSnapshot} reviewsHref={reviewsHref} />
        </div>
      </main>
    </div>
  );
}
