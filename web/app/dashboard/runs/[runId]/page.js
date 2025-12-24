import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { BusinessLayoutProvider } from '../../[business]/BusinessLayoutContext';
import {
  formatDate,
  loadGeoGridRunWithPoints,
  loadGeoGridRunsForKeyword
} from '../../[business]/helpers';
import {
  buildMapPoints,
  extractRunSummary,
  resolveCenter
} from '../../[business]/runs/formatters';
import { buildPointListingIndex } from '../../[business]/runs/listings';
import BusinessNavigation from '../../[business]/BusinessNavigation';
import GeoGridRunViewer from '../../[business]/runs/[runId]/GeoGridRunViewer';
import SidebarBrand from '../../[business]/SidebarBrand';
import DashboardBusinessHeader from '../../[business]/DashboardBusinessHeader';
import { resolveDashboardBusinessContext } from '../../businessContext';

function resolveMapsApiKey() {
  return process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? process.env.GOOGLE_API_KEY ?? null;
}

export default async function GeoGridRunPage({ params, searchParams }) {
  const mapsApiKey = resolveMapsApiKey();

  if (!mapsApiKey) {
    throw new Error('Google Maps API key is required. Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY or GOOGLE_API_KEY.');
  }

  const runId = Number(params.runId);

  if (!Number.isFinite(runId)) {
    notFound();
  }

  const { session, business, layoutContextValue } = await resolveDashboardBusinessContext({
    searchParams
  });

  if (!business || !layoutContextValue) {
    return null;
  }

  const businessIdentifier = business.businessSlug ?? String(business.id);

  if (session.role !== 'owner' && session.role !== 'member' && session.role !== 'admin') {
    redirect(`/dashboard/keywords?bId=${encodeURIComponent(business.id)}`);
  }

  const runData = await loadGeoGridRunWithPoints(business.id, runId);

  if (!runData) {
    notFound();
  }

  const { run, points } = runData;
  const mapPoints = buildMapPoints(points);
  const center = resolveCenter(run, mapPoints);

  if (!center) {
    throw new Error('Unable to determine map center for this run.');
  }

  const runSummary = extractRunSummary(run);
  const pointListings = buildPointListingIndex(points, {
    businessName: business.businessName,
    businessPlaceId: business.gPlaceId
  });
  const relatedRuns = await loadGeoGridRunsForKeyword(business.id, runSummary.keyword ?? null);
  const runOptions = relatedRuns.map((item) => {
    const timestamp = item.finishedAt ?? item.lastMeasuredAt ?? item.createdAt;
    const label =
      formatDate(timestamp) ??
      formatDate(item.createdAt) ??
      `Run #${item.id}`;

    return {
      id: item.id,
      label,
      isCurrent: item.id === run.id
    };
  });

  const canRerun = session.role === 'admin';
  const keywordLabel = runSummary.keyword ?? '(no keyword)';
  const runDateLabel = runSummary.runDate ?? null;
  const runSubtitle = [keywordLabel, runDateLabel].filter(Boolean).join(' • ');
  const backHref = `/dashboard?bId=${encodeURIComponent(business.id)}`;
  const businessName = business.businessName || 'Business dashboard';

  return (
    <BusinessLayoutProvider value={layoutContextValue}>
      <div className="dashboard-layout">
        <div className="dashboard-layout__body">
          <aside className="dashboard-layout__sidebar" aria-label="Workspace navigation">
            <SidebarBrand />
            <div className="dashboard-sidebar__menu">
              <BusinessNavigation businessId={business.id} active={null} />
            </div>
          </aside>

          <main className="dashboard-layout__main">
            <DashboardBusinessHeader organizationId={session.organizationId} />
            <div className="dashboard-layout__content" style={{ width: 'min(1240px, 100%)' }}>
            <header className="dashboard-page-header">
              <div className="dashboard-page-header__intro">
                <h2 className="page-title">Ranking report</h2>
                {runSubtitle ? <p className="page-subtitle">{runSubtitle}</p> : null}
              </div>
              <div className="dashboard-page-header__actions">
                <Link className="cta-link" href={backHref}>
                  ← Back to {businessName}
                </Link>
              </div>
            </header>

            <GeoGridRunViewer
              apiKey={mapsApiKey}
              businessId={business.id}
              businessIdentifier={businessIdentifier}
              initialRun={run}
              initialMapPoints={mapPoints}
              initialCenter={center}
              initialSummary={runSummary}
              initialPointListings={pointListings}
              runOptions={runOptions}
              canRerun={canRerun}
            />
            </div>
          </main>
        </div>
      </div>
    </BusinessLayoutProvider>
  );
}
