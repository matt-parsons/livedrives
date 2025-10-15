'use client';

import { useMemo, useRef, useState } from 'react';
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

export default function GeoGridRunViewer({
  apiKey,
  businessId,
  businessIdentifier,
  initialRun,
  initialMapPoints,
  initialCenter,
  initialSummary,
  runOptions
}) {
  const [run, setRun] = useState(initialRun);
  const [runSummary, setRunSummary] = useState(initialSummary);
  const [mapPoints, setMapPoints] = useState(initialMapPoints);
  const [center, setCenter] = useState(initialCenter);
  const [selectedRunId, setSelectedRunId] = useState(initialRun.id);
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

      setRun(nextRun);
      setRunSummary(nextSummary);
      setMapPoints(nextMapPoints);
      setCenter(nextCenter);
      setSelectedRunId(nextRun.id);
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
          <GeoGridMap apiKey={apiKey} center={center} points={mapPoints} />
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
    </>
  );
}

