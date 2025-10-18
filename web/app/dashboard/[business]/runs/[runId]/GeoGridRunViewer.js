'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import GeoGridMap from './GeoGridMap';
import {
  buildCoordinatePair,
  buildMapPoints,
  extractRunSummary,
  formatDecimal,
  formatDuration,
  resolveCenter,
  resolveStatus,
  toTimestamp
} from '../formatters';

function normalizeOptions(runOptions, initialRunId, initialRunLabel) {
  const normalized = Array.isArray(runOptions) ? runOptions : [];
  const seen = new Set();
  const result = [];

  for (const option of normalized) {
    if (!option || !Number.isFinite(Number(option.id))) {
      continue;
    }

    const optionId = Number(option.id);
    if (seen.has(optionId)) {
      continue;
    }

    const label = typeof option.label === 'string' && option.label.trim()
      ? option.label.trim()
      : `Run #${optionId}`;

    result.push({ id: optionId, label });
    seen.add(optionId);
  }

  if (!seen.has(initialRunId)) {
    seen.add(initialRunId);
    result.unshift({
      id: initialRunId,
      label: initialRunLabel ?? `Run #${initialRunId}`
    });
  }

  return result;
}

function normalizePointId(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function buildListingLookup(entries) {
  const lookup = new Map();

  if (!Array.isArray(entries)) {
    return lookup;
  }

  entries.forEach((entry) => {
    const pointId = normalizePointId(entry?.pointId);

    if (pointId === null) {
      return;
    }

    const listings = Array.isArray(entry?.listings)
      ? entry.listings.map((item, index) => {
          const rank = normalizePointId(item?.rank);
          const rankLabel = typeof item?.rankLabel === 'string' && item.rankLabel.trim()
            ? item.rankLabel.trim()
            : rank === null
              ? '?'
              : rank > 20
                ? '20+'
                : String(rank);

          return {
            key: item?.key ?? `${pointId}:${index}`,
            name: typeof item?.name === 'string' && item.name.trim() ? item.name.trim() : 'Unnamed listing',
            placeId: item?.placeId || null,
            address: typeof item?.address === 'string' && item.address.trim() ? item.address.trim() : null,
            rating: toFiniteNumber(item?.rating),
            reviewCount: toFiniteNumber(item?.reviewCount),
            reviewsUrl: typeof item?.reviewsUrl === 'string' && item.reviewsUrl.trim() ? item.reviewsUrl : null,
            rank,
            rankLabel,
            isTarget: Boolean(item?.isTarget)
          };
        })
      : [];

    lookup.set(pointId, listings);
  });

  return lookup;
}

function resolveDefaultPointId(points) {
  if (!Array.isArray(points) || !points.length) {
    return null;
  }

  const normalizedPoints = points
    .map((point) => ({
      id: normalizePointId(point?.id),
      row: toFiniteNumber(point?.rowIndex),
      col: toFiniteNumber(point?.colIndex)
    }))
    .filter((point) => point.id !== null);

  if (!normalizedPoints.length) {
    return null;
  }

  const rowValues = Array.from(new Set(normalizedPoints
    .map((point) => point.row)
    .filter((value) => value !== null)))
    .sort((a, b) => a - b);
  const colValues = Array.from(new Set(normalizedPoints
    .map((point) => point.col)
    .filter((value) => value !== null)))
    .sort((a, b) => a - b);

  const rowIndex = rowValues.length ? rowValues[Math.floor((rowValues.length - 1) / 2)] : null;
  const colIndex = colValues.length ? colValues[Math.floor((colValues.length - 1) / 2)] : null;

  if (rowIndex !== null && colIndex !== null) {
    const center = normalizedPoints.find((point) => point.row === rowIndex && point.col === colIndex);

    if (center && center.id !== null) {
      return center.id;
    }
  }

  return normalizedPoints[0].id;
}

export default function GeoGridRunViewer({
  apiKey,
  businessId,
  businessIdentifier,
  initialRun,
  initialMapPoints,
  initialCenter,
  initialSummary,
  initialPointListings,
  runOptions
}) {
  const [run, setRun] = useState(initialRun);
  const [runSummary, setRunSummary] = useState(initialSummary);
  const [mapPoints, setMapPoints] = useState(initialMapPoints);
  const [center, setCenter] = useState(initialCenter);
  const [selectedRunId, setSelectedRunId] = useState(initialRun.id);
  const [pointListingsIndex, setPointListingsIndex] = useState(() => buildListingLookup(initialPointListings));
  const [selectedPointId, setSelectedPointId] = useState(() => resolveDefaultPointId(initialMapPoints));
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const requestRef = useRef(0);

  const options = useMemo(
    () => normalizeOptions(runOptions, initialRun.id, initialSummary.runDate),
    [runOptions, initialRun.id, initialSummary.runDate]
  );

  const hasOtherRuns = options.some((option) => option.id !== run.id);

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
  const originCoordinates = buildCoordinatePair(runSummary.originLat, runSummary.originLng);
  const originLatRaw =
    runSummary.originLat === null || runSummary.originLat === undefined
      ? null
      : Number(runSummary.originLat);
  const originLngRaw =
    runSummary.originLng === null || runSummary.originLng === undefined
      ? null
      : Number(runSummary.originLng);
  const originLink =
    originLatRaw !== null && originLngRaw !== null
      ? `https://www.google.com/maps?q=${originLatRaw},${originLngRaw}`
      : null;
  const runStatus = resolveStatus(runSummary.status);
  const firstTimestamp = toTimestamp(run.createdAt);
  const latestSource = run.lastMeasuredAt ?? run.finishedAt ?? null;
  const latestTimestamp = latestSource ? toTimestamp(latestSource) : 0;
  const runDurationMs =
    firstTimestamp > 0 && latestTimestamp > 0 && latestTimestamp >= firstTimestamp
      ? latestTimestamp - firstTimestamp
      : null;
  const runDurationLabel = runDurationMs === null ? null : formatDuration(runDurationMs);

  const selectedPoint = useMemo(() => {
    if (selectedPointId === null) {
      return null;
    }

    return mapPoints.find((point) => normalizePointId(point?.id) === selectedPointId) ?? null;
  }, [mapPoints, selectedPointId]);

  const selectedListings = useMemo(() => {
    if (selectedPointId === null) {
      return [];
    }

    const listings = pointListingsIndex.get(selectedPointId);
    return Array.isArray(listings) ? listings : [];
  }, [pointListingsIndex, selectedPointId]);

  const selectedRowIndex = toFiniteNumber(selectedPoint?.rowIndex);
  const selectedColIndex = toFiniteNumber(selectedPoint?.colIndex);
  const gridPointLabel = selectedRowIndex !== null && selectedColIndex !== null
    ? `Row ${selectedRowIndex + 1} · Column ${selectedColIndex + 1}`
    : 'Location unavailable';
  const observedRankLabel = (() => {
    if (!selectedPoint) {
      return '—';
    }

    const rankLabel = typeof selectedPoint.rankLabel === 'string' ? selectedPoint.rankLabel : null;

    if (!rankLabel || rankLabel === '?') {
      return 'Not captured';
    }

    return `#${rankLabel}`;
  })();
  const measuredLabel = selectedPoint?.measuredAt ?? '—';
  const listingCountLabel = selectedListings.length === 0
    ? 'No listings recorded'
    : `${selectedListings.length} listing${selectedListings.length === 1 ? '' : 's'} captured`;

  useEffect(() => {
    if (!Array.isArray(mapPoints) || mapPoints.length === 0) {
      if (selectedPointId !== null) {
        setSelectedPointId(null);
      }
      return;
    }

    const hasSelected = mapPoints.some((point) => normalizePointId(point?.id) === selectedPointId);

    if (!hasSelected) {
      const fallback = resolveDefaultPointId(mapPoints);

      if (fallback !== selectedPointId) {
        setSelectedPointId(fallback);
      }
    }
  }, [mapPoints, selectedPointId]);

  const handleRunSelection = async (event) => {
    const nextRunId = Number(event.target.value);

    if (!Number.isFinite(nextRunId) || nextRunId <= 0) {
      return;
    }

    if (nextRunId === run.id) {
      setSelectedRunId(nextRunId);
      return;
    }

    const previousRunId = run.id;
    setSelectedRunId(nextRunId);
    setLoading(true);
    setErrorMessage(null);

    const requestId = requestRef.current + 1;
    requestRef.current = requestId;

    try {
      const response = await fetch(
        `/api/businesses/${businessId}/geo-grid/runs/${nextRunId}`,
        {
          method: 'GET',
          headers: {
            Accept: 'application/json'
          },
          cache: 'no-store'
        }
      );

      const payload = await response.json().catch(() => ({}));

      if (!response.ok || payload?.error) {
        throw new Error(payload?.error || 'Failed to load run.');
      }

      if (requestRef.current !== requestId) {
        return;
      }

      const nextRun = payload.run;
      const nextPointsRaw = Array.isArray(payload.points) ? payload.points : [];
      const nextMapPoints = buildMapPoints(nextPointsRaw);
      const nextCenter = resolveCenter(nextRun, nextMapPoints);

      if (!nextCenter) {
        throw new Error('Run does not include enough location data to render.');
      }

      const nextSummary = extractRunSummary(nextRun);
      const nextPointListingsRaw = Array.isArray(payload.pointListings) ? payload.pointListings : [];
      const nextPointListings = buildListingLookup(nextPointListingsRaw);
      const defaultPointId = resolveDefaultPointId(nextMapPoints);

      setRun(nextRun);
      setRunSummary(nextSummary);
      setMapPoints(nextMapPoints);
      setCenter(nextCenter);
      setSelectedRunId(nextRun.id);
      setPointListingsIndex(nextPointListings);
      setSelectedPointId(defaultPointId);
      setErrorMessage(null);

      if (typeof window !== 'undefined') {
        const identifier = businessIdentifier ?? String(businessId);
        const nextUrl = `/dashboard/${encodeURIComponent(identifier)}/runs/${nextRun.id}`;
        window.history.replaceState({}, '', nextUrl);
      }
    } catch (error) {
      if (requestRef.current !== requestId) {
        return;
      }

      console.error('Failed to load geo grid run', error);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load run.');
      setSelectedRunId(previousRunId);
    } finally {
      if (requestRef.current === requestId) {
        setLoading(false);
      }
    }
  };

  const handlePointSelect = useCallback((pointId) => {
    const normalized = normalizePointId(pointId);

    if (normalized === null || normalized === selectedPointId) {
      return;
    }

    setSelectedPointId(normalized);
  }, [selectedPointId]);

  return (
    <>
      <section className="section">
        <div className="surface-card surface-card--muted run-summary">
          <div className="run-summary-col">
            <div className="run-summary__header">
              <div className="run-summary__keyword">
                <span className="run-summary__label">Keyword</span>
                <span className="run-summary__value">
                  "{runSummary.keyword || 'Unspecified keyword'}"
                </span>
              </div>

              {hasOtherRuns ? (
                <div
                  className="run-summary__selector"
                  style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}
                >
                  <label
                    htmlFor="geo-grid-run-selector"
                    className="run-summary__label"
                    style={{ fontSize: '0.68rem' }}
                  >
                    Other runs for this keyword
                  </label>
                  <select
                    id="geo-grid-run-selector"
                    value={selectedRunId}
                    onChange={handleRunSelection}
                    disabled={loading}
                    style={{ minWidth: '220px' }}
                  >
                    {options.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {loading ? (
                    <span className="muted" style={{ fontSize: '0.8rem' }}>
                      Loading run…
                    </span>
                  ) : null}
                  {errorMessage ? (
                    <span style={{ color: '#b91c1c', fontSize: '0.82rem' }}>{errorMessage}</span>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="run-summary__metrics">
              <span className="metric-highlight metric-highlight--solv">
                <span className="metric-highlight__label">SoLV (Top 3)</span>
                <span className="metric-highlight__value">{solvTop3}</span>
              </span>
              <span className="metric-highlight">
                <span className="metric-highlight__label">ARP</span>
                <span className="metric-highlight__value">{avgPosition}</span>
              </span>
            </div>
          </div>
          <div className="run-summary-col">
            <ul className="run-summary__facts">
              <li>
                <strong>Search performed:</strong>{' '}
                <span className="run-summary__date">{runSummary.runDate ?? '—'}</span>
              </li>
              <li>
                <strong>Grid:</strong> {gridSizeLabel} · Radius {radiusLabel} · Spacing{' '}
                {spacingLabel}
              </li>
              <li>
                <strong>Duration:</strong> {runDurationLabel || '—'}
              </li>
              <li>
                <strong>Origin:</strong> {originCoordinates ?? '—'}{' '}
                {originLink ? (
                  <a
                    className="inline-link"
                    href={originLink}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View on Google Maps ↗
                  </a>
                ) : null}
              </li>
              <li>
                <strong>Run:</strong> #{runSummary.runId}
              </li>
              <li>
                <strong>Status:</strong> {runStatus.label}
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section className="section align-center">
        <div className="surface-card surface-card--muted map-card">
          <div className="map-layout">
            <aside className="map-layout__sidebar">
              <div className="map-layout__sidebar-header">
                <h2 className="sidebar-title">Local listings</h2>
                <p className="sidebar-subtitle">Click a grid point on the map to inspect the listings captured from that location.</p>
              </div>
              {selectedPoint ? (
                <div className="listing-point-summary" role="status">
                  <div className="listing-point-summary__row">
                    <span className="listing-point-summary__label">Grid point</span>
                    <span className="listing-point-summary__value">{gridPointLabel}</span>
                  </div>
                  <div className="listing-point-summary__row">
                    <span className="listing-point-summary__label">Observed rank</span>
                    <span className="listing-point-summary__value">{observedRankLabel}</span>
                  </div>
                  <div className="listing-point-summary__row">
                    <span className="listing-point-summary__label">Measured</span>
                    <span className="listing-point-summary__value">{measuredLabel}</span>
                  </div>
                  <div className="listing-point-summary__row">
                    <span className="listing-point-summary__label">Listings captured</span>
                    <span className="listing-point-summary__value">{listingCountLabel}</span>
                  </div>
                </div>
              ) : (
                <div className="listing-point-summary listing-point-summary--empty">
                  <p>Select a grid point on the map to reveal captured listings.</p>
                </div>
              )}

              {selectedListings.length ? (
                <ul className="listing-list">
                  {selectedListings.map((entry, index) => {
                    const ratingLabel = entry.rating !== null && entry.rating !== undefined
                      ? `${formatDecimal(entry.rating, 1)}★`
                      : null;
                    const reviewsLabel = Number.isFinite(entry.reviewCount)
                      ? `${entry.reviewCount.toLocaleString()} review${entry.reviewCount === 1 ? '' : 's'}`
                      : null;
                    const rankBadge = entry.rankLabel && entry.rankLabel !== '?'
                      ? `#${entry.rankLabel}`
                      : '?';

                    return (
                      <li
                        key={entry.key || `${selectedPointId}:${index}`}
                        className={`listing-card${entry.isTarget ? ' listing-card--target' : ''}`}
                      >
                        <div className="listing-card__header">
                          <div className="listing-card__title-group">
                            <span className="listing-card__name">{entry.name}</span>
                            {entry.isTarget ? (
                              <span className="listing-card__badge">Your business</span>
                            ) : null}
                          </div>
                          <span className="listing-card__rank" aria-label="Observed rank">
                            {rankBadge}
                          </span>
                        </div>
                        {entry.address ? (
                          <p className="listing-card__address">{entry.address}</p>
                        ) : null}
                        <div className="listing-card__meta">
                          {ratingLabel ? (
                            <span className="listing-card__stat">
                              {ratingLabel}
                              {reviewsLabel ? (
                                <span className="listing-card__muted"> · {reviewsLabel}</span>
                              ) : null}
                            </span>
                          ) : reviewsLabel ? (
                            <span className="listing-card__stat">{reviewsLabel}</span>
                          ) : null}
                        </div>
                        {entry.reviewsUrl ? (
                          <a
                            className="listing-card__link"
                            href={entry.reviewsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            View Google reviews ↗
                          </a>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : selectedPoint ? (
                <p className="listing-empty">No listings were captured for this grid point.</p>
              ) : null}
            </aside>
            <div className="map-layout__map">
              <GeoGridMap
                apiKey={apiKey}
                center={center}
                points={mapPoints}
                selectedPointId={selectedPointId}
                onPointSelect={handlePointSelect}
              />
            </div>
          </div>
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
      <style jsx>{`
        .map-layout {
          display: flex;
          align-items: stretch;
        }

        .map-layout__sidebar {
          flex: 0 0 320px;
          max-width: 340px;
          display: flex;
          flex-direction: column;
          gap: 18px;
          padding: 10px;
          border-right: 1px solid rgba(15, 23, 42, 0.08);
        }

        .map-layout__sidebar-header {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .sidebar-title {
          font-size: 1rem;
          font-weight: 600;
          color: var(--color-heading, #0f172a);
        }

        .sidebar-subtitle {
          font-size: 0.85rem;
          color: var(--color-muted, #475569);
          line-height: 1.4;
        }

        .listing-point-summary {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 12px 14px;
          border-radius: var(--radius-md, 12px);
          background: rgba(15, 23, 42, 0.05);
          border: 1px solid rgba(15, 23, 42, 0.08);
        }

        .listing-point-summary__row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          font-size: 0.78rem;
        }

        .listing-point-summary__label {
          color: var(--color-muted, #475569);
          font-weight: 600;
        }

        .listing-point-summary__value {
          color: var(--color-heading, #0f172a);
          font-weight: 600;
          text-align: right;
        }

        .listing-point-summary--empty {
          background: rgba(15, 23, 42, 0.03);
          color: var(--color-muted, #475569);
          align-items: center;
          justify-content: center;
          min-height: 96px;
          text-align: center;
        }

        .listing-point-summary--empty p {
          margin: 0;
          font-size: 0.82rem;
          line-height: 1.45;
        }

        .listing-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 12px;
          max-height: 560px;
          overflow-y: auto;
          padding-right: 4px;
        }

        .listing-card {
          border: 1px solid rgba(15, 23, 42, 0.08);
          border-radius: var(--radius-md, 12px);
          padding: 14px 16px;
          background: rgba(15, 23, 42, 0.02);
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .listing-card--target {
          border-color: rgba(26, 116, 49, 0.28);
          background: rgba(26, 116, 49, 0.08);
        }

        .listing-card__header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
        }

        .listing-card__title-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .listing-card__name {
          font-weight: 600;
          font-size: 0.96rem;
          color: var(--color-heading, #0f172a);
        }

        .listing-card__badge {
          align-self: flex-start;
          font-size: 0.7rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: #1a7431;
          background: rgba(26, 116, 49, 0.12);
          padding: 4px 6px;
          border-radius: var(--radius-sm, 8px);
        }

        .listing-card__rank {
          font-size: 0.9rem;
          font-weight: 600;
          color: var(--color-heading, #0f172a);
          background: rgba(15, 23, 42, 0.06);
          padding: 4px 8px;
          border-radius: var(--radius-sm, 8px);
          min-width: 48px;
          text-align: center;
        }

        .listing-card__address {
          margin: 0;
          font-size: 0.82rem;
          color: var(--color-muted, #475569);
          line-height: 1.4;
        }

        .listing-card__meta {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          font-size: 0.78rem;
          color: var(--color-heading, #0f172a);
        }

        .listing-card__stat {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-weight: 500;
        }

        .listing-card__muted {
          color: var(--color-muted, #64748b);
          font-weight: 400;
        }

        .listing-card__link {
          align-self: flex-start;
          font-size: 0.78rem;
          color: var(--color-primary, #2563eb);
          text-decoration: none;
          font-weight: 600;
        }

        .listing-card__link:hover {
          text-decoration: underline;
        }

        .listing-empty {
          font-size: 0.84rem;
          color: var(--color-muted, #475569);
          line-height: 1.5;
        }

        .map-layout__map {
          flex: 1 1 auto;
          min-width: 0;
        }

        .map-layout__map :global(.geo-grid-map) {
          height: 100%;
        }

        .map-layout__map :global(.geo-grid-map__canvas) {
          min-height: clamp(360px, 52vw, 560px);
        }

        @media (max-width: 1100px) {
          .map-layout {
            flex-direction: column;
          }

          .map-layout__sidebar {
            border-right: none;
            padding-right: 0;
            max-width: none;
          }

          .map-layout__map :global(.geo-grid-map__canvas) {
            min-height: clamp(320px, 70vw, 520px);
          }
        }
      `}</style>
    </>
  );
}

