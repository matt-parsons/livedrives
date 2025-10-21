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

const TREND_PALETTES = {
  positive: {
    icon: '↑',
    iconBg: 'rgba(61, 125, 99, 0.18)',
    iconColor: '#1f4d3a',
    containerBg: 'rgba(61, 125, 99, 0.08)',
    border: 'rgba(61, 125, 99, 0.32)',
    valueColor: '#0f5132',
    labelColor: '#1f2937',
    deltaColor: '#1f4d3a',
    deltaSubtle: 'rgba(31, 77, 58, 0.85)',
    shadow: '0 12px 32px rgba(16, 185, 129, 0.15)'
  },
  negative: {
    icon: '↓',
    iconBg: 'rgba(239, 68, 68, 0.06)',
    iconColor: 'rgba(127, 29, 29, 0.55)',
    containerBg: '#ffffff',
    border: 'rgba(17, 24, 39, 0.08)',
    valueColor: '#4b5563',
    labelColor: '#6b7280',
    deltaColor: 'rgba(127, 29, 29, 0.55)',
    deltaSubtle: 'rgba(107, 114, 128, 0.85)',
    shadow: 'none'
  },
  neutral: {
    icon: '→',
    iconBg: 'rgba(107, 114, 128, 0.08)',
    iconColor: '#4b5563',
    containerBg: '#f9fafb',
    border: 'rgba(148, 163, 184, 0.25)',
    valueColor: '#1f2937',
    labelColor: '#6b7280',
    deltaColor: '#4b5563',
    deltaSubtle: 'rgba(107, 114, 128, 0.8)',
    shadow: 'none'
  }
};

function TrendMetric({ heading, valueLabel, indicator, deltaLabel }) {
  const status = getTrendStatus(indicator);
  const palette = TREND_PALETTES[status] ?? TREND_PALETTES.neutral;
  const icon = palette.icon;
  const trendText = indicator?.text ?? '0';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.9rem',
        borderRadius: '16px',
        padding: '1rem 1.15rem',
        background: palette.containerBg,
        border: `1px solid ${palette.border}`,
        width: '100%',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '42px',
          height: '42px',
          borderRadius: '999px',
          background: palette.iconBg,
          color: palette.iconColor,
          fontWeight: 700,
          fontSize: '1.15rem'
        }}
      >
        {icon}
      </span>
      <div style={{ flex: '1 1 auto' }}>
        <div
          style={{
            fontSize: '0.78rem',
            fontWeight: 600,
            color: palette.labelColor,
            letterSpacing: '0.04em',
            textTransform: 'uppercase'
          }}
        >
          {heading}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: '0.55rem',
            marginTop: '0.25rem'
          }}
        >
          <span
            style={{
              fontSize: '1.5rem',
              fontWeight: 700,
              color: palette.valueColor
            }}
          >
            {valueLabel}
          </span>
          {indicator ? (
            <span
              style={{
                fontSize: '0.95rem',
                fontWeight: 600,
                color: palette.deltaColor
              }}
            >
              {trendText}
            </span>
          ) : null}
        </div>
        {deltaLabel ? (
          <div
            style={{
              marginTop: '0.35rem',
              fontSize: '0.75rem',
              color: palette.deltaSubtle
            }}
          >
            30d change {deltaLabel}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function KeywordSwitcher({ items, activeKey, onSelect }) {
  if (items.length <= 1) {
    return null;
  }

  return (
    <div
      role="tablist"
      aria-label="Keyword performance switcher"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.5rem',
        marginBottom: '1.25rem'
      }}
    >
      {items.map((item) => {
        const isActive = item.key === activeKey;
        const status = getTrendStatus(item.solvTrendIndicator ?? item.avgTrendIndicator);
        const indicatorText = item.solvTrendIndicator?.text ?? item.avgTrendIndicator?.text ?? null;
        const indicatorIcon =
          status === 'positive' ? '↑' : status === 'negative' ? '↓' : '→';
        const indicatorColor =
          status === 'positive'
            ? '#0f5132'
            : status === 'negative'
              ? 'rgba(107, 114, 128, 0.9)'
              : '#4b5563';
        const indicatorBackground =
          status === 'positive' ? 'rgba(26, 116, 49, 0.12)' : 'transparent';

        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(item.key)}
            style={{
              borderRadius: '999px',
              border: isActive ? '1px solid #111827' : '1px solid rgba(17, 24, 39, 0.1)',
              backgroundColor: isActive ? '#111827' : '#ffffff',
              color: isActive ? '#ffffff' : '#374151',
              padding: '0.5rem 0.9rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.55rem',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
              transition: 'background-color 160ms ease, color 160ms ease, border-color 160ms ease'
            }}
          >
            <span>{item.keyword}</span>
            {indicatorText ? (
              <span
                aria-hidden="true"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: indicatorColor,
                  backgroundColor: indicatorBackground,
                  padding: status === 'positive' ? '0.15rem 0.45rem' : '0',
                  borderRadius: '999px'
                }}
              >
                {indicatorIcon}
                <span>{indicatorText}</span>
              </span>
            ) : null}
          </button>
        );
      })}
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

  return (
    <div style={{ marginTop: '16px' }}>
      <KeywordSwitcher items={items} activeKey={activeItem.key} onSelect={setActiveKey} />

      <article
        role="tabpanel"
        style={{
          backgroundColor: '#ffffff',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.4rem',
          minHeight: '240px',
        }}
      >
        <header
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            gap: '1rem'
          }}
        >
          <div>
            <h3
              style={{
                fontSize: '1.2rem',
                fontWeight: 700,
                marginBottom: '0rem',
                color: '#111827'
              }}
            >
              {activeItem.keyword}
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0px' }}>
              {latestRunDescription ? <> {latestRunDescription}</> : null}
            </p>
          </div>
          {statusLabel ? (
            <span
              style={{
                alignSelf: 'flex-start',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                color: '#1d4ed8',
                padding: '0.35rem 0.75rem',
                borderRadius: '999px',
                fontSize: '0.75rem',
                fontWeight: 600,
                letterSpacing: '0.02em',
                textTransform: 'uppercase'
              }}
            >
              {statusLabel}
            </span>
          ) : null}
        </header>

        <KeywordTrendChart points={activeItem.chartPoints} />

        <div
          style={{
            display: 'grid',
            gap: '1rem',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))'
          }}
        >
          <TrendMetric
            heading="SoLV top 3"
            valueLabel={activeItem.solvLabel}
            indicator={activeItem.solvTrendIndicator}
            deltaLabel={activeItem.solvDeltaLabel}
          />
          <TrendMetric
            heading="Avg position"
            valueLabel={activeItem.avgLabel}
            indicator={activeItem.avgTrendIndicator}
            deltaLabel={activeItem.avgDeltaLabel}
          />
        </div>

        {mapsApiKey ? (
          activeItem.latestRunMap ? (
            <div
              style={{
                marginTop: '0.5rem',
                borderRadius: '16px',
                overflow: 'hidden'
              }}
            >
              <GeoGridMap
                key={activeItem.latestRunId ?? activeItem.key}
                apiKey={mapsApiKey}
                center={activeItem.latestRunMap.center}
                points={activeItem.latestRunMap.points}
                interactive={false}
                selectedPointId={null}
                minHeight="clamp(220px, 45vw, 320px)"
              />
            </div>
          ) : activeItem.latestRunId ? (
            <div
              style={{
                marginTop: '0.5rem',
                fontSize: '0.78rem',
                color: '#6b7280',
                backgroundColor: '#f9fafb',
                border: '1px solid rgba(148, 163, 184, 0.32)',
                borderRadius: '12px',
                padding: '0.85rem 1rem'
              }}
            >
              Geo grid map preview unavailable for this run.
            </div>
          ) : null
        ) : activeItem.latestRunId ? (
          <div
            style={{
              marginTop: '0.5rem',
              fontSize: '0.78rem',
              color: '#6b7280',
              backgroundColor: '#f9fafb',
              border: '1px solid rgba(148, 163, 184, 0.32)',
              borderRadius: '12px',
              padding: '0.85rem 1rem'
            }}
          >
            Add a Google Maps API key to preview the latest geo grid run.
          </div>
        ) : null}

        {activeItem.latestRunHref ? (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.75rem'
            }}
          >
            <div style={{ fontSize: '0.78rem', color: '#6b7280' }}>
              Jump to the latest geo grid run to inspect detailed rankings.
            </div>
            <Link
              className="cta-link"
              href={activeItem.latestRunHref}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontWeight: 600,
                fontSize: '0.85rem'
              }}
            >
              View run details ↗
            </Link>
          </div>
        ) : null}
      </article>
    </div>
  );
}
