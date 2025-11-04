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
import { resolveLetterGrade } from './optimization';
import { loadOptimizationData } from '@/lib/optimizationData';

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

function selectNextOptimizationSteps(roadmap, limit = 3) {
  if (!roadmap || !Array.isArray(roadmap.tasks)) {
    return [];
  }

  return roadmap.tasks
    .filter((task) => task.status && task.status.key !== 'completed')
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
    .slice(0, limit);
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

  const isOwner = session.role === 'owner';
  const canManageSettings = session.role === 'owner' || session.role === 'admin';

  const geoGridRunsRaw = await loadGeoGridRunSummaries(business.id);
  const geoGridRuns = geoGridRunsRaw.map(mapRunRecord);
  const latestRunSummary = summarizeLatestRun(geoGridRuns, baseHref);

  let optimizationRoadmap = null;
  let optimizationError = null;

  if (business.gPlaceId) {
    try {
      const { roadmap } = await loadOptimizationData(business.gPlaceId);
      optimizationRoadmap = roadmap;
    } catch (error) {
      optimizationError = error?.message ?? 'Failed to load Google Places details.';
    }
  }

  const optimizationGrade = optimizationRoadmap
    ? resolveLetterGrade(optimizationRoadmap.progressPercent)
    : null;
  const optimizationSteps = selectNextOptimizationSteps(optimizationRoadmap);

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


            <section className="section">
              <div className="surface-card surface-card--muted surface-card--compact">
                <div className="section-header">
                  <div>
                    <h2 className="section-title">Next steps to optimize</h2>
                    <p className="section-caption">
                      Focus on these tasks to strengthen your local visibility.
                    </p>
                  </div>
                  <Link className="cta-link" href={optimizationHref}>
                    Explore full roadmap ↗
                  </Link>
                </div>

                {business.gPlaceId && optimizationRoadmap ? (
                  optimizationSteps.length ? (
                    <ul
                      style={{
                        listStyle: 'none',
                        display: 'grid',
                        gap: '0.75rem',
                        margin: '0.75rem 0 0',
                        padding: 0
                      }}
                    >
                      {optimizationSteps.map((task) => (
                        <li
                          key={task.id}
                          style={{
                            border: '1px solid rgba(3, 60, 87, 0.12)',
                            borderRadius: '12px',
                            padding: '0.85rem 1rem',
                            background: '#fff',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.4rem'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                            <strong style={{ fontSize: '1.05rem', color: 'var(--color-heading)' }}>{task.label}</strong>
                            <span className="status-pill" data-status={task.status.key}>
                              {task.status.label}
                            </span>
                          </div>
                          <p style={{ margin: 0, color: 'rgba(3, 60, 87, 0.66)', fontSize: '0.9rem' }}>{task.detail}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p style={{ marginTop: '0.75rem', color: '#6b7280' }}>
                      Great work! Automated checks did not surface additional actions right now.
                    </p>
                  )
                ) : (
                  <p style={{ marginTop: '0.75rem', color: '#6b7280' }}>
                    Connect your Google Business Profile to unlock personalized recommendations.
                  </p>
                )}
              </div>
            </section>

            <section className="section">
              <div className="surface-card surface-card--muted">
                <div className="section-header">
                  <div>
                    <h2 className="section-title">GBP optimization</h2>
                    <p className="section-caption">
                      Gauge how complete your Google Business Profile looks today.
                    </p>
                  </div>
                  <Link className="cta-link" href={optimizationHref}>
                    View full checklist ↗
                  </Link>
                </div>

                {business.gPlaceId ? (
                  optimizationError ? (
                    <div className="inline-error" role="status" style={{ marginTop: '0.75rem' }}>
                      <strong>Unable to contact Google Places</strong>
                      <span>{optimizationError}</span>
                    </div>
                  ) : optimizationRoadmap ? (
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
                          gap: '1.5rem',
                          alignItems: 'center'
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>Overall grade</span>
                          <strong style={{ fontSize: '2rem', color: 'var(--color-heading)' }}>
                            {optimizationGrade ?? '—'}
                          </strong>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>Automated readiness</span>
                          <strong style={{ fontSize: '1.4rem', color: 'var(--color-heading)' }}>
                            {optimizationRoadmap.progressPercent}% complete
                          </strong>
                        </div>
                      </div>

                      <div
                        style={{
                          height: '0.65rem',
                          borderRadius: '999px',
                          background: 'rgba(3, 60, 87, 0.12)',
                          overflow: 'hidden'
                        }}
                        role="presentation"
                      >
                        <div
                          style={{
                            width: `${Math.min(100, Math.max(0, optimizationRoadmap.progressPercent))}%`,
                            background: 'var(--color-primary)',
                            height: '100%'
                          }}
                        />
                      </div>
                    </div>
                  ) : (
                    <p style={{ marginTop: '0.75rem', color: '#6b7280' }}>
                      We could not compute optimization insights for this profile yet.
                    </p>
                  )
                ) : (
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
                )}
              </div>
            </section>



            <section className="section">
              <div className="surface-card surface-card--muted">
                <div className="section-header">
                  <div>
                    <h2 className="section-title">Latest geo grid run</h2>
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
