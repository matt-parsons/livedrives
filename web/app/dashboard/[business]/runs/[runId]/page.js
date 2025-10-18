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

  const business = await loadBusiness(session.organizationId, identifier);

  if (!business) {
    notFound();
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

  const backHref = `/dashboard/${encodeURIComponent(params.business)}`;
  const businessName = business.businessName || 'Business dashboard';

  return (
    <div className="page-shell">
      <nav className="page-nav" aria-label="Breadcrumb">
        <Link className="back-link" href={backHref}>
          ← {businessName}
        </Link>
      </nav>
      <GeoGridRunViewer
        apiKey={mapsApiKey}
        businessId={business.id}
        businessIdentifier={params.business}
        initialRun={run}
        initialMapPoints={mapPoints}
        initialCenter={center}
        initialSummary={runSummary}
        initialPointListings={pointListings}
        runOptions={runOptions}
      />
    </div>
  );
}
