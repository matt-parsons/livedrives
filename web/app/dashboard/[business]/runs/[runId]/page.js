import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AuthError, requireAuth } from '@/lib/authServer';
import {
  formatDate,
  loadBusiness,
  loadGeoGridRunWithPoints,
  loadGeoGridRunsForKeyword
} from '../../helpers';
import {
  buildMapPoints,
  extractRunSummary,
  resolveCenter
} from '../formatters';
import { buildPointListingIndex } from '../listings';
import BusinessNavigation from '../../BusinessNavigation';
import GeoGridRunViewer from './GeoGridRunViewer';

function resolveMapsApiKey() {
  return process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? process.env.GOOGLE_API_KEY ?? null;
}

export default async function GeoGridRunPage({ params }) {
  const mapsApiKey = resolveMapsApiKey();

  if (!mapsApiKey) {
    throw new Error('Google Maps API key is required. Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY or GOOGLE_API_KEY.');
  }

  const identifier = params.business;
  const runId = Number(params.runId);

  if (!Number.isFinite(runId)) {
    notFound();
  }

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

  const businessIdentifier = business.businessSlug ?? String(business.id);

  if (session.role !== 'owner') {
    redirect(`/dashboard/${encodeURIComponent(businessIdentifier)}/keywords`);
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

  const canRerun = session.role === 'owner';
  const keywordLabel = runSummary.keyword ?? '(no keyword)';
  const runDateLabel = runSummary.runDate ?? null;
  const runSubtitle = [keywordLabel, runDateLabel].filter(Boolean).join(' • ');
  const backHref = `/dashboard/${encodeURIComponent(businessIdentifier)}`;
  const businessName = business.businessName || 'Business dashboard';

  return (
    <div className="dashboard-layout__body">
        <aside className="dashboard-layout__sidebar" aria-label="Workspace navigation">
          <div className="dashboard-sidebar__menu">
            <BusinessNavigation businessIdentifier={businessIdentifier} active={null} />
          </div>
        </aside>

        <main className="dashboard-layout__main">
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
  );
}
