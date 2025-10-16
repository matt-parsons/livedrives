'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { GEO_GRID_PRESETS, GEO_RADIUS_PRESETS } from '@/lib/geoGrid';

function toBusinessId(value) {
  if (!value) return '';
  return String(value);
}

export default function GeoGridLauncher() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [selectedBusinessId, setSelectedBusinessId] = useState('');
  const [selectedGridId, setSelectedGridId] = useState('');
  const [selectedRadius, setSelectedRadius] = useState('');
  const [selectedKeyword, setSelectedKeyword] = useState('');
  const [keywordScope, setKeywordScope] = useState('today');
  const [status, setStatus] = useState({ message: '', tone: 'muted' });
  const [submitting, setSubmitting] = useState(false);

  const gridOptions = useMemo(() => {
    if (data && Array.isArray(data.gridPresets) && data.gridPresets.length) {
      return data.gridPresets;
    }
    return GEO_GRID_PRESETS;
  }, [data]);

  const radiusOptions = useMemo(() => {
    if (data && Array.isArray(data.radiusPresets) && data.radiusPresets.length) {
      return data.radiusPresets;
    }
    return GEO_RADIUS_PRESETS;
  }, [data]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/geo-grid/launcher', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load launcher data.');
      }

      setData(payload);
    } catch (err) {
      setError(err.message || 'Failed to load launcher data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!data) {
      setSelectedBusinessId('');
      setSelectedGridId('');
      setSelectedRadius('');
      return;
    }

    if (Array.isArray(data.businesses) && data.businesses.length) {
      setSelectedBusinessId((prev) => {
        if (prev && data.businesses.some((biz) => toBusinessId(biz.id) === prev)) {
          return prev;
        }
        return toBusinessId(data.businesses[0].id);
      });
    } else {
      setSelectedBusinessId('');
    }

    setSelectedGridId((prev) => {
      if (prev && gridOptions.some((option) => option.id === prev)) {
        return prev;
      }
      return gridOptions.length ? gridOptions[0].id : '';
    });

    setSelectedRadius((prev) => {
      if (prev && radiusOptions.some((option) => String(option) === String(prev))) {
        return prev;
      }
      return radiusOptions.length ? String(radiusOptions[0]) : '';
    });
  }, [data, gridOptions, radiusOptions]);

  const selectedBusiness = useMemo(() => {
    if (!data || !Array.isArray(data.businesses)) {
      return null;
    }
    return data.businesses.find((biz) => toBusinessId(biz.id) === selectedBusinessId) ?? null;
  }, [data, selectedBusinessId]);

  const keywordSets = useMemo(() => {
    const empty = { today: [], all: [] };
    if (!selectedBusiness) {
      return empty;
    }
    const today = Array.isArray(selectedBusiness.keywords?.today) ? selectedBusiness.keywords.today : [];
    const all = Array.isArray(selectedBusiness.keywords?.all) ? selectedBusiness.keywords.all : [];
    return { today, all };
  }, [selectedBusiness]);

  useEffect(() => {
    setKeywordScope('today');
  }, [selectedBusinessId]);

  useEffect(() => {
    if (!selectedBusiness) {
      setSelectedKeyword('');
      return;
    }

    const primaryList = keywordScope === 'all' ? keywordSets.all : keywordSets.today;
    const fallbackList = keywordScope === 'all' ? keywordSets.today : keywordSets.all;

    if (keywordScope === 'today' && primaryList.length === 0 && fallbackList.length > 0) {
      setKeywordScope('all');
      return;
    }

    const activeList = primaryList.length ? primaryList : fallbackList;

    if (!activeList.length) {
      setSelectedKeyword('');
      return;
    }

    setSelectedKeyword((prev) => {
      if (prev && activeList.some((entry) => entry.keyword === prev)) {
        return prev;
      }
      return activeList[0].keyword;
    });
  }, [selectedBusiness, keywordScope, keywordSets]);

  const activeKeywordList = useMemo(() => {
    if (!selectedBusiness) {
      return [];
    }
    if (keywordScope === 'all') {
      return keywordSets.all;
    }
    return keywordSets.today.length ? keywordSets.today : keywordSets.all;
  }, [keywordScope, keywordSets, selectedBusiness]);

  const selectedGrid = useMemo(() => {
    if (!gridOptions.length) {
      return null;
    }
    return gridOptions.find((option) => option.id === selectedGridId) ?? gridOptions[0];
  }, [gridOptions, selectedGridId]);

  const radiusValue = useMemo(() => {
    const value = Number(selectedRadius);
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
    const fallback = radiusOptions.length ? Number(radiusOptions[0]) : null;
    return Number.isFinite(fallback) ? fallback : null;
  }, [selectedRadius, radiusOptions]);

  const pointsCount = selectedGrid ? selectedGrid.rows * selectedGrid.cols : 0;

  const handleRefresh = useCallback(() => {
    loadData();
  }, [loadData]);

  const handleSubmit = useCallback(
    async (event) => {
      event.preventDefault();

      if (!selectedBusiness) {
        setStatus({ message: 'Select a business to start a geo grid run.', tone: 'danger' });
        return;
      }

      if (!selectedKeyword) {
        setStatus({ message: 'Select a keyword before starting a geo grid run.', tone: 'danger' });
        return;
      }

      if (!selectedGrid) {
        setStatus({ message: 'Select a grid configuration.', tone: 'danger' });
        return;
      }

      if (!Number.isFinite(radiusValue) || radiusValue <= 0) {
        setStatus({ message: 'Select a valid radius.', tone: 'danger' });
        return;
      }

      setSubmitting(true);
      setStatus({ message: 'Resolving origin zone…', tone: 'muted' });

      try {
        const businessId = selectedBusiness.id;
        const params = new URLSearchParams({
          keyword: selectedKeyword,
          radiusMiles: String(radiusValue)
        });
        const originResponse = await fetch(`/api/businesses/${businessId}/geo-grid/origin?${params.toString()}`, {
          cache: 'no-store'
        });
        const originData = await originResponse.json().catch(() => ({}));

        if (!originResponse.ok) {
          throw new Error(originData.error || 'Failed to resolve origin zone.');
        }

        const effectiveRadius = Number.isFinite(originData.radiusMiles)
          ? originData.radiusMiles
          : radiusValue;

        const zoneLabel = originData.zoneName || originData.canonical || 'origin zone';
        const coordsLabel = Number.isFinite(originData.lat) && Number.isFinite(originData.lng)
          ? `${Number(originData.lat).toFixed(4)}, ${Number(originData.lng).toFixed(4)}`
          : 'unknown coordinates';
        const businessLabel = selectedBusiness.businessName || `Business ${businessId}`;
        const confirmMessage = `Start a ${selectedGrid.label} grid (${effectiveRadius} mi radius, ${pointsCount} points) for ${businessLabel} — “${selectedKeyword}”?\nOrigin: ${zoneLabel} (${coordsLabel})`;

        if (typeof window !== 'undefined' && !window.confirm(confirmMessage)) {
          setStatus({ message: 'Geo grid run cancelled.', tone: 'muted' });
          setSubmitting(false);
          return;
        }

        setStatus({ message: 'Creating geo grid run…', tone: 'muted' });

        const payload = {
          keyword: selectedKeyword,
          gridRows: selectedGrid.rows,
          gridCols: selectedGrid.cols,
          radiusMiles: effectiveRadius,
          originZone: originData.zoneName || originData.canonical || null
        };

        const originLat = Number(originData.lat);
        const originLng = Number(originData.lng);

        if (Number.isFinite(originLat) && Number.isFinite(originLng)) {
          payload.originLat = originLat;
          payload.originLng = originLng;
        }

        const createResponse = await fetch(`/api/businesses/${businessId}/geo-grid/runs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const createData = await createResponse.json().catch(() => ({}));

        if (!createResponse.ok) {
          throw new Error(createData.error || 'Failed to create geo grid run.');
        }

        setStatus({
          message: `Run #${createData.runId} created. The worker will pick it up shortly.`,
          tone: 'success'
        });
      } catch (err) {
        setStatus({ message: err.message || 'Failed to start geo grid run.', tone: 'danger' });
      } finally {
        setSubmitting(false);
      }
    },
    [pointsCount, radiusValue, selectedBusiness, selectedGrid, selectedKeyword]
  );

  return (
    <div className="surface-card geo-launcher-card">
      <div>
        <h2 className="section-title">Launch a geo grid</h2>
        <p className="section-caption">
          Kick off a geo grid run for any managed business. Choose a keyword and configuration, confirm the origin zone,
          and the worker queue will handle the rest.
        </p>
      </div>

      <form className="geo-launcher__form" onSubmit={handleSubmit}>
        {error ? (
          <div className="inline-error" role="alert">
            <strong>Unable to load launcher data.</strong>
            <span>{error}</span>
          </div>
        ) : null}

        {status.message ? (
          <div className={`geo-launcher__status geo-launcher__status--${status.tone}`} role="status">
            {status.message}
          </div>
        ) : null}

        <div className="input-field">
          <label className="input-label" htmlFor="geo-launcher-business">Business</label>
          <select
            id="geo-launcher-business"
            className="text-input"
            value={selectedBusinessId}
            onChange={(event) => setSelectedBusinessId(event.target.value)}
            disabled={loading || submitting || !data || !Array.isArray(data.businesses) || !data.businesses.length}
          >
            <option value="">Select a business…</option>
            {(data?.businesses ?? []).map((business) => (
              <option key={business.id} value={toBusinessId(business.id)}>
                {business.businessName || `Business ${business.id}`}
              </option>
            ))}
          </select>
        </div>

        <div className="input-field">
          <div className="geo-launcher__keyword-header">
            <label className="input-label" htmlFor="geo-launcher-keyword">Keyword</label>
            <div className="geo-launcher__scope-toggle" role="group" aria-label="Keyword scope">
              <button
                type="button"
                className={keywordScope === 'today' ? 'segmented-button segmented-button--active' : 'segmented-button'}
                onClick={() => setKeywordScope('today')}
                disabled={keywordSets.today.length === 0 || submitting}
              >
                Today
              </button>
              <button
                type="button"
                className={keywordScope === 'all' ? 'segmented-button segmented-button--active' : 'segmented-button'}
                onClick={() => setKeywordScope('all')}
                disabled={keywordSets.all.length === 0 || submitting}
              >
                All time
              </button>
            </div>
          </div>

          {activeKeywordList.length ? (
            <select
              id="geo-launcher-keyword"
              className="text-input"
              value={selectedKeyword}
              onChange={(event) => setSelectedKeyword(event.target.value)}
              disabled={submitting}
            >
              {activeKeywordList.map((entry) => (
                <option key={entry.keyword} value={entry.keyword}>
                  {entry.count > 0 ? `${entry.keyword} (${entry.count})` : entry.keyword}
                </option>
              ))}
            </select>
          ) : (
            <div className="muted geo-launcher__empty">No keywords recorded yet for this business.</div>
          )}
        </div>

        <div className="geo-launcher__grid">
          <div className="input-field">
            <label className="input-label" htmlFor="geo-launcher-grid">Grid size</label>
            <select
              id="geo-launcher-grid"
              className="text-input"
              value={selectedGridId}
              onChange={(event) => setSelectedGridId(event.target.value)}
              disabled={submitting || gridOptions.length === 0}
            >
              {gridOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label} ({option.rows * option.cols} pts)
                </option>
              ))}
            </select>
          </div>

          <div className="input-field">
            <label className="input-label" htmlFor="geo-launcher-radius">Radius (miles)</label>
            <select
              id="geo-launcher-radius"
              className="text-input"
              value={selectedRadius}
              onChange={(event) => setSelectedRadius(event.target.value)}
              disabled={submitting || radiusOptions.length === 0}
            >
              {radiusOptions.map((radius) => (
                <option key={radius} value={String(radius)}>
                  {radius} mi
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="geo-launcher__summary muted">
          {selectedGrid ? `${selectedGrid.rows}×${selectedGrid.cols} grid · ${pointsCount} points` : 'No grid selected'}
          {Number.isFinite(radiusValue) ? ` · ${radiusValue} mi radius` : ''}
        </div>

        <div className="geo-launcher__actions">
          <button
            type="submit"
            className="primary-button"
            disabled={
              submitting ||
              !selectedBusiness ||
              !selectedKeyword ||
              !selectedGrid ||
              !Number.isFinite(radiusValue) ||
              radiusValue <= 0
            }
          >
            {submitting ? 'Starting…' : 'Start geo grid run'}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={handleRefresh}
            disabled={loading || submitting}
          >
            Refresh data
          </button>
        </div>

        {loading ? <div className="muted">Loading launcher data…</div> : null}
      </form>
    </div>
  );
}
