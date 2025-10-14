import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AuthError, requireAuth } from '@/lib/authServer';
import {
  formatDate,
  formatDecimal,
  loadBusiness,
  loadGeoGridRunWithPoints
} from '../../helpers';
import GeoGridMap from './GeoGridMap';

function resolveMapsApiKey() {
  return process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? process.env.GOOGLE_API_KEY ?? null;
}

function buildMapPoints(points) {
  return points
    .map((point) => {
      if (point.lat === null || point.lat === undefined || point.lng === null || point.lng === undefined) {
        return null;
      }

      const rawRank = point.rankPosition === null || point.rankPosition === undefined
        ? null
        : Number(point.rankPosition);

      return {
        id: point.id,
        rowIndex: point.rowIndex,
        colIndex: point.colIndex,
        lat: Number(point.lat),
        lng: Number(point.lng),
        rankPosition: rawRank,
        rankLabel: rawRank === null
          ? '?'
          : rawRank > 20
            ? '20+'
            : String(rawRank),
        measuredAt: formatDate(point.measuredAt)
      };
    })
    .filter(Boolean);
}

function resolveCenter(run, points) {
  const originLat = run.originLat === null || run.originLat === undefined ? null : Number(run.originLat);
  const originLng = run.originLng === null || run.originLng === undefined ? null : Number(run.originLng);

  if (originLat !== null && originLng !== null) {
    return { lat: originLat, lng: originLng };
  }

  if (!points.length) {
    return null;
  }

  const sum = points.reduce(
    (acc, point) => {
      acc.lat += point.lat;
      acc.lng += point.lng;
      return acc;
    },
    { lat: 0, lng: 0 }
  );

  return {
    lat: sum.lat / points.length,
    lng: sum.lng / points.length
  };
}

function extractRunSummary(run) {
  const rankedPoints = Number(run.rankedPoints ?? 0);
  const top3Points = Number(run.top3Points ?? 0);
  const avgPositionValue = run.avgRank === null || run.avgRank === undefined ? null : Number(run.avgRank);
  const avgPosition = avgPositionValue === null ? null : formatDecimal(avgPositionValue, 2);
  const solvValue = rankedPoints > 0 ? (top3Points * 100) / rankedPoints : null;
  const solvTop3 = solvValue === null ? null : formatDecimal(solvValue, 1);

  return {
    runId: run.id,
    keyword: run.keyword,
    status: run.status,
    gridRows: run.gridRows,
    gridCols: run.gridCols,
    radiusMiles: run.radiusMiles,
    spacingMiles: run.spacingMiles,
    originLat: run.originLat,
    originLng: run.originLng,
    notes: run.notes,
    rankedPoints,
    top3Points,
    avgPositionValue,
    avgPosition,
    solvValue,
    solvTop3,
    createdAt: formatDate(run.createdAt),
    finishedAt: formatDate(run.finishedAt),
    lastMeasuredAt: formatDate(run.lastMeasuredAt),
    runDate: formatDate(run.finishedAt ?? run.lastMeasuredAt ?? run.createdAt)
  };
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
  const backHref = `/dashboard/${encodeURIComponent(params.business)}`;

  return (
    <div className="geo-grid-run">
      <nav>
        <Link href={backHref}>Back to business</Link>
      </nav>

      <header>
        <h1>Geo Grid Run #{runSummary.runId}</h1>
        <p>
          Keyword: <strong>{runSummary.keyword || 'Unspecified keyword'}</strong>
        </p>
        <p>
          Status: <strong>{runSummary.status || 'unknown'}</strong>
        </p>
      </header>

      <section className="geo-grid-run-stats">
        <div>
          <h2>Performance</h2>
          <p>Average position: <strong>{runSummary.avgPosition ?? '—'}</strong></p>
          <p>SoLV (Top 3): <strong>{runSummary.solvTop3 ? `${runSummary.solvTop3}%` : '—'}</strong></p>
          <p>
            Ranked points: <strong>{runSummary.rankedPoints}</strong> of{' '}
            <strong>{run.totalPoints ?? 0}</strong>
          </p>
        </div>
        <div>
          <h2>Grid</h2>
          <p>
            Size: <strong>{runSummary.gridRows ?? '—'} x {runSummary.gridCols ?? '—'}</strong>
          </p>
          <p>
            Radius: <strong>{formatDecimal(runSummary.radiusMiles, 2) ?? '—'} mi</strong>
          </p>
          <p>
            Spacing: <strong>{formatDecimal(runSummary.spacingMiles, 2) ?? '—'} mi</strong>
          </p>
        </div>
        <div>
          <h2>Timing</h2>
          <p>Run date: <strong>{runSummary.runDate ?? '—'}</strong></p>
          <p>First point: <strong>{runSummary.createdAt ?? '—'}</strong></p>
          <p>Latest point: <strong>{runSummary.lastMeasuredAt ?? runSummary.finishedAt ?? '—'}</strong></p>
        </div>
      </section>

      <section className="geo-grid-map-section">
        <h2>Map</h2>
        <GeoGridMap
          apiKey={mapsApiKey}
          center={center}
          points={mapPoints}
          gridRows={runSummary.gridRows}
          gridCols={runSummary.gridCols}
          radiusMiles={runSummary.radiusMiles}
          spacingMiles={runSummary.spacingMiles}
        />
      </section>

      {runSummary.notes ? (
        <section>
          <h2>Notes</h2>
          <p>{runSummary.notes}</p>
        </section>
      ) : null}
    </div>
  );
}
