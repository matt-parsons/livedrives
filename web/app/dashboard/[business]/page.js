import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AuthError, requireAuth } from '@/lib/authServer';
import BusinessNavigation from './BusinessNavigation';
import {
  formatDate,
  formatDecimal,
  toTimestamp,
  loadBusiness,
  loadGeoGridRunSummaries
} from './helpers';
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

  const status = resolveStatus(latest.status);
  const solvLabel =
    latest.solvTop3Value === null || latest.solvTop3Value === undefined
      ? '—'
      : `${formatDecimal(latest.solvTop3Value, 1)}%`;
  const avgLabel =
    latest.avgPositionValue === null || latest.avgPositionValue === undefined
      ? '—'
      : formatDecimal(latest.avgPositionValue, 2);

  return {
    id: latest.id ?? null,
    keyword: latest.keyword || '(no keyword)',
    runDate: latest.runDate ?? '—',
    status,
    totalPoints: latest.totalPoints ?? 0,
    top3Points: latest.top3Points ?? 0,
    solvLabel,
    avgLabel,
    href: latest.id ? `${baseHref}/runs/${latest.id}` : null
  };
}


export default async function BusinessDashboardPage({ params }) {
  const identifier = params.business;
  const baseHref = `/dashboard/${encodeURIComponent(identifier)}`;
  const keywordsHref = `${baseHref}/keywords`;
  const optimizationHref = `${baseHref}/optimization-steps`;
  const editHref = `${baseHref}/edit`;

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
              editHref={editHref}
            />


            <section className="section">
              <div className="surface-card surface-card--muted">
                <div className="section-header">
                  <div>
                    <h2 className="section-title">Latest Ranking Report</h2>
                    <p className="section-caption">
                      Review your freshest keyword coverage snapshot across the map.
                    </p>
                  </div>
                  <Link className="cta-link" href={keywordsHref}>
                    View keyword insights ↗
                  </Link>
                </div>

                {latestRunSummary ? (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.85rem',
                        marginTop: '0.75rem'
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: '0.75rem',
                          justifyContent: 'space-between',
                          alignItems: 'baseline'
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                          <strong style={{ fontSize: '1.1rem' }}>{latestRunSummary.keyword}</strong>
                          <span style={{ color: '#6b7280', fontSize: '0.9rem' }}>Run on {latestRunSummary.runDate}</span>
                        </div>
                        <span className="status-pill" data-status={latestRunSummary.status.key}>
                          {latestRunSummary.status.label}
                        </span>
                      </div>

                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                          gap: '0.85rem'
                        }}
                      >
                        <div className="metric-chip">
                          <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>SoLV (Top 3)</span>
                          <strong style={{ fontSize: '1.4rem' }}>{latestRunSummary.solvLabel}</strong>
                        </div>
                        <div className="metric-chip">
                          <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>Avg. position</span>
                          <strong style={{ fontSize: '1.4rem' }}>{latestRunSummary.avgLabel}</strong>
                        </div>
                        <div className="metric-chip">
                          <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>Points ranked</span>
                          <strong style={{ fontSize: '1.4rem' }}>
                            {latestRunSummary.top3Points}/{latestRunSummary.totalPoints}
                          </strong>
                        </div>
                      </div>

                      {latestRunSummary.href ? (
                        <div>
                          <Link className="cta-link" href={latestRunSummary.href}>
                            Open run details ↗
                          </Link>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <p style={{ marginTop: '0.75rem', color: '#6b7280' }}>
                      No geo grid runs captured yet. Launch your first run from the keywords workspace.
                    </p>
                  )}
              </div>
            </section>

          </div>
        </main>
      </div>
  );
}
