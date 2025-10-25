'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import GeoGridMap from './runs/[runId]/GeoGridMap';
import KeywordTrendChart from './KeywordTrendChart';

function getTrendStatus(indicator) {
  if (!indicator || typeof indicator.className !== 'string') {
    return 'neutral';
  }

  if (indicator.className.includes('--positive')) {
    return 'positive';
  }

  if (indicator.className.includes('--negative')) {
    return 'negative';
  }

  return 'neutral';
}

const SUMMARY_TONES = {
  positive: {
    valueColor: '#0f5132',
    chipColor: '#0f5132',
    chipBg: 'rgba(15, 81, 50, 0.12)',
    border: 'rgba(15, 23, 42, 0.08)',
    shadow: '0 18px 32px rgba(15, 81, 50, 0.1)'
  },
  negative: {
    valueColor: '#991b1b',
    chipColor: '#b91c1c',
    chipBg: 'rgba(185, 28, 28, 0.12)',
    border: 'rgba(185, 28, 28, 0.18)',
    shadow: '0 18px 32px rgba(185, 28, 28, 0.06)'
  },
  neutral: {
    valueColor: '#111827',
    chipColor: '#4b5563',
    chipBg: 'rgba(148, 163, 184, 0.2)',
    border: 'rgba(148, 163, 184, 0.32)',
    shadow: '0 12px 28px rgba(15, 23, 42, 0.05)'
  }
};

function SummaryCard({ title, valueLabel, indicator, deltaLabel }) {
  const status = getTrendStatus(indicator);
  const palette = SUMMARY_TONES[status] ?? SUMMARY_TONES.neutral;
  const indicatorText = indicator?.text ?? null;
  const indicatorIcon = indicator?.icon ?? '→';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        padding: '1.25rem 1.4rem',
        borderRadius: '20px',
        backgroundColor: '#ffffff',
        border: `1px solid ${palette.border}`,
        boxShadow: palette.shadow
      }}
    >
      <span
        style={{
          fontSize: '0.82rem',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: '#6b7280'
        }}
      >
        {title}
      </span>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '0.75rem'
        }}
      >
        <span
          style={{
            fontSize: '2rem',
            fontWeight: 700,
            color: palette.valueColor
          }}
        >
          {valueLabel}
        </span>
        {indicatorText ? (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.35rem 0.7rem',
              borderRadius: '999px',
              backgroundColor: palette.chipBg,
              color: palette.chipColor,
              fontSize: '0.85rem',
              fontWeight: 600
            }}
          >
            <span aria-hidden="true">{indicatorIcon}</span>
            <span>{indicatorText}</span>
          </span>
        ) : null}
      </div>
      {deltaLabel ? (
        <span style={{ fontSize: '0.82rem', color: '#6b7280' }}>30d change {deltaLabel}</span>
      ) : null}
    </div>
  );
}

function renderHeatmapContent(activeItem, mapsApiKey) {
  if (!activeItem.latestRunId) {
    return (
      <p style={{ margin: 0, fontSize: '0.85rem', color: '#6b7280' }}>
        Deploy another geo grid run to unlock the live heatmap preview.
      </p>
    );
  }

  if (!mapsApiKey) {
    return (
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
        Add a Google Maps API key to preview the latest geo grid run.
      </div>
    );
  }

  if (!activeItem.latestRunMap) {
    return (
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
        Geo grid map preview unavailable for this run.
      </div>
    );
  }

  return (
    <div
      style={{
        borderRadius: '16px',
        overflow: 'hidden',
        border: '1px solid rgba(148, 163, 184, 0.2)'
      }}
    >
      <GeoGridMap
        key={activeItem.latestRunId}
        apiKey={mapsApiKey}
        center={activeItem.latestRunMap.center}
        points={activeItem.latestRunMap.points}
        interactive={false}
        selectedPointId={null}
        minHeight="clamp(220px, 45vw, 320px)"
      />
    </div>
  );
}

export default function KeywordPerformanceSpotlight({ items, mapsApiKey = null }) {
  const [activeKey, setActiveKey] = useState(() => items[0]?.key ?? null);

  useEffect(() => {
    if (!items.some((item) => item.key === activeKey)) {
      setActiveKey(items[0]?.key ?? null);
    }
  }, [items, activeKey]);

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
          Not enough geo grid runs in the last 30 days to chart keyword movement.
        </p>
      </div>
    );
  }

  const activeItem = useMemo(() => {
    if (!items.length) {
      return null;
    }

    return items.find((item) => item.key === activeKey) ?? items[0];
  }, [items, activeKey]);

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
      className="surface-card surface-card--muted"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1.75rem',
        padding: '1.75rem'
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '1rem',
          justifyContent: 'space-between',
          alignItems: 'flex-end'
        }}
      >
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
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '1rem',
          fontSize: '0.85rem',
          color: '#6b7280'
        }}
      >
        <span>
          Runs tracked <strong style={{ color: '#111827' }}>{activeItem.runCount}</strong>
        </span>
        {latestRunDescription ? <span>{latestRunDescription}</span> : null}
      </div>

      <div
        style={{
          display: 'grid',
          gap: '1rem',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))'
        }}
      >
        {summaryCards.map((card) => (
          <SummaryCard
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
        <KeywordTrendChart points={activeItem.chartPoints} />
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
              Visualize how this keyword ranks across your configured service area.
            </p>
          </div>
          {activeItem.latestRunHref ? (
            <Link
              className="cta-link"
              href={activeItem.latestRunHref}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontWeight: 600 }}
            >
              View run details ↗
            </Link>
          ) : null}
        </div>

        {renderHeatmapContent(activeItem, mapsApiKey)}
      </div>
    </div>
  );
}
