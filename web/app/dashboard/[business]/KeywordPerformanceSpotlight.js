'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import GeoGridRunViewer from './runs/[runId]/GeoGridRunViewer';
import KeywordTrendChart from './KeywordTrendChart';
import SummaryMetricCard from './SummaryMetricCard';
import { buildMapPoints, extractRunSummary, resolveCenter } from './runs/formatters';
import KeywordAiOverviewCard from './keywords/KeywordAiOverviewCard';

export default function KeywordPerformanceSpotlight({ items, mapsApiKey = null, businessId, businessIdentifier, businessName }) {
  const [activeKey, setActiveKey] = useState(() => items[0]?.key ?? null);
  const [heatmapState, setHeatmapState] = useState(() => ({
    loading: false,
    error: null,
    runData: null
  }));

  useEffect(() => {
    if (!items.some((item) => item.key === activeKey)) {
      setActiveKey(items[0]?.key ?? null);
    }
  }, [items, activeKey]);

  const activeItem = useMemo(() => {
    if (!items.length) {
      return null;
    }

    return items.find((item) => item.key === activeKey) ?? items[0];
  }, [items, activeKey]);

  useEffect(() => {
    let isMounted = true;

    async function loadRun() {
      if (!activeItem?.latestRunId || !mapsApiKey || !businessId) {
        if (isMounted) {
          setHeatmapState({ loading: false, error: null, runData: null });
        }
        return;
      }

      setHeatmapState((prev) => ({ ...prev, loading: true, error: null }));

      try {
        const response = await fetch(
          `/api/businesses/${encodeURIComponent(businessId)}/geo-grid/runs/${encodeURIComponent(
            activeItem.latestRunId
          )}`
        );

        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error || 'Unable to load run.');
        }

        const payload = await response.json();
        const mapPoints = buildMapPoints(payload.points);
        const center = resolveCenter(payload.run, mapPoints);

        if (!center) {
          throw new Error('Unable to determine map center.');
        }

        const summary = extractRunSummary(payload.run);

        if (isMounted) {
          setHeatmapState({
            loading: false,
            error: null,
            runData: {
              run: payload.run,
              mapPoints,
              center,
              summary,
              pointListings: payload.pointListings ?? []
            }
          });
        }
      } catch (error) {
        if (isMounted) {
          setHeatmapState({
            loading: false,
            error: error?.message || 'Ranking report map preview unavailable for this run.',
            runData: null
          });
        }
      }
    }

    loadRun();

    return () => {
      isMounted = false;
    };
  }, [activeItem?.latestRunId, mapsApiKey, businessId]);

  if (!items.length) {
    return (
      <div className="surface-card surface-card--muted surface-card--compact">
        <div className="section-header">
          <div>
            <h2 className="section-title">Keyword performance</h2>
            <p className="section-caption">Latest visibility for your business over the past 30 days.</p>
          </div>
        </div>
        <p style={{ marginTop: '1rem', color: '#6b7280' }}>
          There haven&apos;t been any ranking reports in the last 30 days to chart keyword movement.
        </p>
      </div>
    );
  }

  if (!activeItem) {
    return null;
  }

  const latestRunDescription =
    activeItem.latestRunDate && activeItem.latestRunDate !== '—'
      ? `Last scan: ${activeItem.latestRunDate}`
      : null;
  const statusLabel = activeItem.status?.label ?? null;

  const summaryCards = [
    {
      id: 'avg',
      title: 'Average position',
      valueLabel: activeItem.avgLabel,
      indicator: activeItem.avgTrendIndicator,
      deltaLabel: activeItem.avgDeltaLabel
    },
    {
      id: 'solv',
      title: 'Share of local voice (Top 3)',
      valueLabel: activeItem.solvLabel,
      indicator: activeItem.solvTrendIndicator,
      deltaLabel: activeItem.solvDeltaLabel
    }
  ];

  return (
    <div
      className=""
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1.75rem',
      }}
    >
      <div className="surface-card surface-card--muted surface-card--compact">

        <div style={{ flex: '1 1 260px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <label
            htmlFor="keyword-selector"
            style={{ fontSize: '0.82rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#6b7280' }}
          >
            Select keyword
          </label>
          <div
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              borderRadius: '14px',
              border: '1px solid rgba(148, 163, 184, 0.35)',
              backgroundColor: '#ffffff',
              padding: '0.35rem 0.75rem'
            }}
          >
            <select
              id="keyword-selector"
              value={activeItem.key}
              onChange={(event) => setActiveKey(event.target.value)}
              style={{
                width: '100%',
                border: 'none',
                outline: 'none',
                fontSize: '0.95rem',
                fontWeight: 500,
                color: '#111827',
                background: 'transparent',
                padding: '0.45rem 0.35rem'
              }}
            >
              {items.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.keyword}
                </option>
              ))}
            </select>
          </div>
        </div>
        {statusLabel ? (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '999px',
              backgroundColor: 'rgba(59, 130, 246, 0.12)',
              color: '#1d4ed8',
              fontSize: '0.78rem',
              fontWeight: 600,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              padding: '0.4rem 0.9rem'
            }}
          >
            {statusLabel}
          </span>
        ) : null}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '1rem',
            fontSize: '0.85rem',
            color: '#6b7280',
            paddingTop: '10px',
            paddingLeft: '5px'
          }}
        >
          <span>
            Runs tracked <strong style={{ color: '#111827' }}>{activeItem.runCount}</strong>
          </span>
          {latestRunDescription ? <span>{latestRunDescription}</span> : null}
        </div>

      </div>

      <div
        style={{
          display: 'grid',
          gap: '1rem',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))'
        }}
      >
        {summaryCards.map((card) => (
          <SummaryMetricCard
            key={card.id}
            title={card.title}
            valueLabel={card.valueLabel}
            indicator={card.indicator}
            deltaLabel={card.deltaLabel}
          />
        ))}
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          borderRadius: '20px',
          backgroundColor: '#ffffff',
          border: '1px solid rgba(148, 163, 184, 0.25)',
          padding: '1.5rem'
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            gap: '0.75rem',
            alignItems: 'center'
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: '#111827' }}>Ranking heatmap</h3>
            <p style={{ margin: '0.35rem 0 0', fontSize: '0.85rem', color: '#6b7280' }}>
              See where your business shous up when customers are searching for your services.
            </p>
          </div>
          {/* {activeItem.latestRunHref ? (
            <Link
              className="cta-link"
              href={activeItem.latestRunHref}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontWeight: 600 }}
            >
              View run details ↗
            </Link>
          ) : null} */}
        </div>

        {!activeItem.latestRunId ? (
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#6b7280' }}>
            Deploy another ranking report run to unlock the live heatmap preview.
          </p>
        ) : !mapsApiKey ? (
          <div
            style={{
              fontSize: '0.82rem',
              color: '#6b7280',
              backgroundColor: '#f9fafb',
              border: '1px solid rgba(148, 163, 184, 0.32)',
              borderRadius: '12px',
              padding: '0.85rem 1rem'
            }}
          >
            Add a Google Maps API key to preview the latest ranking report run.
          </div>
        ) : heatmapState.loading ? (
          <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>Loading latest run…</div>
        ) : heatmapState.error ? (
          <div
            style={{
              fontSize: '0.82rem',
              color: '#6b7280',
              backgroundColor: '#f9fafb',
              border: '1px solid rgba(148, 163, 184, 0.32)',
              borderRadius: '12px',
              padding: '0.85rem 1rem'
            }}
          >
            {heatmapState.error}
          </div>
        ) : heatmapState.runData ? (
          <div
            style={{
              borderRadius: '16px',
              overflow: 'hidden',
              border: '1px solid rgba(148, 163, 184, 0.2)'
            }}
          >
            <GeoGridRunViewer
              key={heatmapState.runData.run.id}
              apiKey={mapsApiKey}
              businessId={businessId}
              businessIdentifier={businessIdentifier ?? String(businessId)}
              initialRun={heatmapState.runData.run}
              initialMapPoints={heatmapState.runData.mapPoints}
              initialCenter={heatmapState.runData.center}
              initialSummary={heatmapState.runData.summary}
              initialPointListings={heatmapState.runData.pointListings}
              runOptions={[]}
              canRerun={false}
            />
          </div>
        ) : (
          <div
            style={{
              fontSize: '0.82rem',
              color: '#6b7280',
              backgroundColor: '#f9fafb',
              border: '1px solid rgba(148, 163, 184, 0.32)',
              borderRadius: '12px',
              padding: '0.85rem 1rem'
            }}
          >
            Ranking report map preview unavailable for this run.
          </div>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          borderRadius: '20px',
          backgroundColor: '#ffffff',
          border: '1px solid rgba(148, 163, 184, 0.25)',
          padding: '1.5rem'
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem'
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: '#111827' }}>Performance over time</h3>
            <p style={{ margin: '0.35rem 0 0', fontSize: '0.85rem', color: '#6b7280' }}>
              Track ranking position and share of local voice for the selected keyword.
            </p>
          </div>
          {latestRunDescription ? (
            <span style={{ fontSize: '0.82rem', color: '#6b7280' }}>{latestRunDescription}</span>
          ) : null}
        </div>
        <KeywordAiOverviewCard businessId={businessId} businessName={businessName} isReady={true} />
        <KeywordTrendChart points={activeItem.chartPoints} />
      </div>
    </div>
  );
}
