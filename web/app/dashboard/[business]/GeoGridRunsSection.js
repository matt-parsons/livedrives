'use client';

import { useState } from 'react';
import Link from 'next/link';

const VIEW_OPTIONS = [
  { id: 'trend', label: 'Keyword trend' },
  { id: 'list', label: 'Detailed runs' }
];

function normalizeView(value) {
  return value === 'list' ? 'list' : 'trend';
}

function formatValue(value, digits = 2, unit = '') {
  if (value === null || value === undefined) {
    return '—';
  }

  const number = Number(value);

  if (Number.isNaN(number)) {
    return '—';
  }

  return `${number.toFixed(digits)}${unit}`;
}

function buildTrendIndicator(delta, { invert = false, unit = '', digits = 2 } = {}) {
  if (delta === null || delta === undefined) {
    return {
      icon: '•',
      className: 'trend-indicator--neutral',
      text: '—',
      description: 'No comparison available'
    };
  }

  const value = Number(delta);

  if (!Number.isFinite(value)) {
    return {
      icon: '•',
      className: 'trend-indicator--neutral',
      text: '—',
      description: 'No comparison available'
    };
  }

  const isImproving = invert ? value < 0 : value > 0;
  const isDeclining = invert ? value > 0 : value < 0;

  if (isImproving) {
    return {
      icon: invert ? '▼' : '▲',
      className: 'trend-indicator--positive',
      text: `${value > 0 ? '+' : ''}${value.toFixed(digits)}${unit}`,
      description: 'Improving'
    };
  }

  if (isDeclining) {
    return {
      icon: invert ? '▲' : '▼',
      className: 'trend-indicator--negative',
      text: `${value > 0 ? '+' : ''}${value.toFixed(digits)}${unit}`,
      description: 'Declining'
    };
  }

  return {
    icon: '→',
    className: 'trend-indicator--neutral',
    text: `0${unit}`,
    description: 'No change'
  };
}

function TrendMetric({ label, dataset, invert = false, unit = '', digits = 2 }) {
  const indicator = buildTrendIndicator(dataset.delta, { invert, unit, digits });
  const first = formatValue(dataset.first, digits, unit);
  const latest = formatValue(dataset.latest, digits, unit);

  return (
    <div className="trend-stat">
      <div className="trend-stat__header">
        <span className="trend-stat__label">{label}</span>
        <span className={`trend-indicator ${indicator.className}`} title={indicator.description}>
          <span aria-hidden="true">{indicator.icon}</span>
          <span>{indicator.text}</span>
        </span>
      </div>
      <div className="trend-stat__values">
        <span>{first}</span>
        <span className="trend-stat__arrow" aria-hidden="true">
          →
        </span>
        <span>{latest}</span>
      </div>
    </div>
  );
}

export default function GeoGridRunsSection({ caption, defaultView = 'trend', trendItems, runItems }) {
  const [activeView, setActiveView] = useState(() => normalizeView(defaultView));

  const handleSwitch = (id) => {
    const nextView = normalizeView(id);
    setActiveView(nextView);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (nextView === 'list') {
        url.searchParams.set('view', 'list');
      } else {
        url.searchParams.delete('view');
      }
      window.history.replaceState({}, '', url);
    }
  };

  return (
    <div className="surface-card surface-card--muted">
      <div className="section-header">
        <h2 className="section-title">Geo grid runs</h2>
        <p className="section-caption">{caption}</p>
      </div>

      <div className="view-switch" role="tablist" aria-label="Geo grid view mode">
        {VIEW_OPTIONS.map((option) => {
          const isActive = activeView === option.id;

          return isActive ? (
            <strong key={option.id} role="tab" aria-selected="true">
              {option.label}
            </strong>
          ) : (
            <button
              key={option.id}
              type="button"
              role="tab"
              aria-selected="false"
              className="view-switch__button"
              onClick={() => handleSwitch(option.id)}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {activeView === 'trend' ? (
        trendItems.length === 0 ? (
          <div className="empty-state" style={{ marginTop: '20px' }}>
            <div>
              <h3>No keyword trends yet</h3>
              <p>Accumulate multiple runs per keyword to unlock trend comparisons.</p>
            </div>
          </div>
        ) : (
          <ul className="card-list" style={{ marginTop: '24px' }}>
            {trendItems.map((item) => (
              <li key={item.key}>
                <div className="list-card">
                  <div className="list-card-header">
                    <div>
                      <h3 className="list-card-title">{item.keyword}</h3>
                      <p className="list-card-subtitle">
                        Runs tracked <strong>{item.runCount}</strong>
                      </p>
                    </div>
                    <span className="status-pill" data-status={item.status.key}>
                      {item.status.label}
                    </span>
                  </div>

                  <div className="trend-meta">
                    <span>First run: {item.firstRunDate ?? '—'}</span>
                    <span>
                      Latest run: {item.latestRunDate ?? '—'}
                      {item.latestRunHref ? (
                        <>
                          {' · '}
                          <Link href={item.latestRunHref}>View run ↗</Link>
                        </>
                      ) : null}
                    </span>
                  </div>

                  <div className="trend-metrics">
                    <TrendMetric label="Avg position" dataset={item.avg} invert digits={2} />
                    <TrendMetric label="SoLV (Top 3)" dataset={item.solv} unit="%" digits={1} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )
      ) : runItems.length === 0 ? (
        <div className="empty-state" style={{ marginTop: '20px' }}>
          <div>
            <h3>No geo grid runs yet</h3>
            <p>Deploy a run to start mapping rankings across your coverage area.</p>
          </div>
        </div>
      ) : (
        <ul className="card-list" style={{ marginTop: '24px' }}>
          {runItems.map((run) => (
            <li key={run.id}>
              <Link className="list-card list-card--interactive" href={run.href}>
                <div className="list-card-header">
                  <div>
                    <h3 className="list-card-title">{run.keyword}</h3>
                    <p className="list-card-subtitle">Run date {run.runDate}</p>
                  </div>
                  <span className="status-pill" data-status={run.status.key}>
                    {run.status.label}
                  </span>
                </div>

                <div className="list-card-meta">
                  <span className="metric-chip">
                    <strong>{run.solvTop3}</strong> SoLV top 3
                  </span>
                  <span className="metric-chip">
                    <strong>{run.avgPosition}</strong> Avg position
                  </span>
                </div>

                {run.gridDetails.length ? (
                  <div className="list-row">
                    {run.gridDetails.map((detail) => (
                      <span key={detail}>{detail}</span>
                    ))}
                  </div>
                ) : null}

                <div className="list-card-footer">
                  {run.footerDetails.map((detail) => (
                    <span key={detail}>{detail}</span>
                  ))}
                </div>

                {run.notes ? <p className="inline-note">Notes: {run.notes}</p> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
