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
  const businessName = business.businessName || 'Business dashboard';
  const runStatus = resolveStatus(runSummary.status);
  const originCoordinates = buildCoordinatePair(runSummary.originLat, runSummary.originLng);
  const totalPoints = run.totalPoints ?? 0;
  const solvTop3 = runSummary.solvTop3 ? `${runSummary.solvTop3}%` : '—';
  const avgPosition = runSummary.avgPosition ?? '—';
  const gridSizeLabel = `${runSummary.gridRows ?? '—'} × ${runSummary.gridCols ?? '—'}`;
  const radiusLabel =
    runSummary.radiusMiles !== null && runSummary.radiusMiles !== undefined
      ? `${formatDecimal(runSummary.radiusMiles, 2) ?? runSummary.radiusMiles} mi`
      : '—';
  const spacingLabel =
    runSummary.spacingMiles !== null && runSummary.spacingMiles !== undefined
      ? `${formatDecimal(runSummary.spacingMiles, 2) ?? runSummary.spacingMiles} mi`
      : '—';
  const firstPoint = runSummary.createdAt ?? '—';
  const latestPoint = runSummary.lastMeasuredAt ?? runSummary.finishedAt ?? '—';
  const runHighlights = [
    { label: 'Keyword', value: runSummary.keyword || 'Unspecified keyword' },
    { label: 'Status', value: runStatus.label, status: runStatus.key },
    { label: 'Run date', value: runSummary.runDate ?? '—' }
  ];
  const originLatRaw = runSummary.originLat === null || runSummary.originLat === undefined ? null : Number(runSummary.originLat);
  const originLngRaw = runSummary.originLng === null || runSummary.originLng === undefined ? null : Number(runSummary.originLng);
  const originLink = originLatRaw !== null && originLngRaw !== null
    ? `https://www.google.com/maps?q=${originLatRaw},${originLngRaw}`
    : null;

  return (
    <div className="page-shell">
      <nav className="page-nav" aria-label="Breadcrumb">
        <Link className="back-link" href={backHref}>
          ← {businessName}
        </Link>
      </nav>

      <section className="page-header">
        <h1 className="page-title">Geo grid run #{runSummary.runId}</h1>
        <p className="page-subtitle">
          Coverage snapshot for {businessName}. Inspect ranking performance, point density, and timing details in
          one place.
        </p>
      </section>

      <section className="section">
        <div className="surface-card surface-card--muted">
          <div className="account-details account-details--compact">
            {runHighlights.map((tile) => (
              <div className="detail-tile detail-tile--contrast" key={tile.label}>
                <strong>{tile.label}</strong>
                {tile.status ? (
                  <span className="status-pill" data-status={tile.status}>
                    {tile.value}
                  </span>
                ) : (
                  <span>{tile.value}</span>
                )}
              </div>
            ))}
          </div>

          <div className="stat-grid">
            <div className="stat-card">
              <strong>Performance</strong>
              <div className="stat-highlight stat-highlight--positive">
                <span className="stat-highlight__label">SoLV (Top 3)</span>
                <span className="stat-highlight__value">{solvTop3}</span>
              </div>
              <div className="stat-highlight stat-highlight--inverse">
                <span className="stat-highlight__label">Avg position</span>
                <span className="stat-highlight__value">{avgPosition}</span>
              </div>
              <small>
                Ranked points {runSummary.rankedPoints} / {totalPoints}
              </small>
            </div>
            <div className="stat-card">
              <strong>Grid layout</strong>
              <span>{gridSizeLabel}</span>
              <small>Radius {radiusLabel}</small>
              <small>Spacing {spacingLabel}</small>
            </div>
            <div className="stat-card">
              <strong>Timeline</strong>
              <span>{runSummary.runDate ?? '—'}</span>
              <small>First point {firstPoint}</small>
              <small>Latest point {latestPoint}</small>
            </div>
            <div className="stat-card">
              <strong>Origin</strong>
              <span>{originCoordinates ?? '—'}</span>
              {originLink ? (
                <a className="inline-link" href={originLink} target="_blank" rel="noopener noreferrer">
                  Open in Google Maps ↗
                </a>
              ) : null}
              <small>Keyword focus {runSummary.keyword || 'Unspecified'}</small>
              <small>Status {runStatus.label}</small>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="surface-card surface-card--muted map-card">
          <div className="section-header">
            <h2 className="section-title">Coverage map</h2>
            <p className="section-caption">Interactive point grid with real-time ranking markers and legend.</p>
          </div>

          <GeoGridMap
            apiKey={mapsApiKey}
            center={center}
            points={mapPoints}
          />
        </div>
      </section>

      {runSummary.notes ? (
        <section className="section">
          <div className="surface-card surface-card--muted surface-card--compact">
            <h2 className="section-title">Run notes</h2>
            <p className="inline-note">{runSummary.notes}</p>
          </div>
        </section>
      ) : null}
    </div>
  );
}
