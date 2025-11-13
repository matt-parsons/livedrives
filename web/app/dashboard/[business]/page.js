import { notFound, redirect } from 'next/navigation';
import { AuthError, requireAuth } from '@/lib/authServer';
import BusinessNavigation from './BusinessNavigation';
import {
  formatDate,
  formatDecimal,
  toTimestamp,
  loadBusiness,
  loadGeoGridRunSummaries,
  loadGeoGridRunWithPoints
} from './helpers';
import { buildMapPoints, resolveCenter } from './runs/formatters';
import OptimizationPanelsClient from './OptimizationPanelsClient';

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
    return { key: 'in_progress', label: 'In progress' };
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
  const createTrend = (currentValue, previousValue) => {
    if (currentValue === null || currentValue === undefined) {
      return null;
    }
    if (previousValue === null || previousValue === undefined) {
      return null;
    }

    const currentNumber = Number(currentValue);
    const previousNumber = Number(previousValue);

    if (!Number.isFinite(currentNumber) || !Number.isFinite(previousNumber)) {
      return null;
    }

    if (currentNumber > previousNumber) {
      return 'up';
    }

    if (currentNumber < previousNumber) {
      return 'down';
    }

    return null;
  };
  const avgTrend = createTrend(latest.avgPositionValue, previous?.avgPositionValue ?? null);
  const solvTrend = createTrend(latest.solvTop3Value, previous?.solvTop3Value ?? null);

  return {
    id: latest.id ?? null,
    keyword: latest.keyword || '(no keyword)',
    runDate: latest.runDate ?? '—',
    status,
    totalPoints: latest.totalPoints ?? 0,
    top3Points: latest.top3Points ?? 0,
    solvLabel,
    avgLabel,
    avgTrend,
    solvTrend,
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

  let session;

  try {
    session = await requireAuth();
  } catch (error) {
    if (error instanceof AuthError && error.statusCode >= 400 && error.statusCode < 500) {
      redirect('/signin');
    }

    throw error;
  }

  const business = await loadBusiness(session.organizationId, identifier);

  if (!business) {
    notFound();
  }

  const canManageSettings = session.role === 'owner' || session.role === 'admin';

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

  const businessIdentifier = business.businessSlug ?? String(business.id);
  return (
    <div className="dashboard-layout__body">
        <aside className="dashboard-layout__sidebar" aria-label="Workspace navigation">
          <div className="dashboard-sidebar__menu">
            <BusinessNavigation businessIdentifier={businessIdentifier} active="dashboard" />
          </div>
        </aside>

        <main className="dashboard-layout__main">
          <div className="dashboard-layout__content">
            <OptimizationPanelsClient
              placeId={business.gPlaceId ?? null}
              businessId={business.id}
              optimizationHref={optimizationHref}
              canManageSettings={canManageSettings}
              isOwner={session.role === 'owner'}
              editHref={editHref}
              mapPoints={mapPoints}
              mapCenter={mapCenter}
              mapsApiKey={mapsApiKey}
              latestRunSummary={latestRunSummary}
              keywordsHref={keywordsHref}
              ctrHref={ctrHref}
            />
          </div>
        </main>
      </div>
  );
}
