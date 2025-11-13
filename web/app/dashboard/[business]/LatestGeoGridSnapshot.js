'use client';

import Link from 'next/link';
import GeoGridMap from './runs/[runId]/GeoGridMap';

function TrendIcon({ direction }) {
  if (direction !== 'up' && direction !== 'down') {
    return null;
  }

  const icon = direction === 'up' ? '▲' : '▼';

  return (
    <span className={`latest-geogrid-card__trend latest-geogrid-card__trend--${direction}`} aria-hidden="true">
      {icon}
    </span>
  );
}

export default function LatestGeoGridSnapshot({
  apiKey = null,
  center = null,
  points = [],
  summary = null,
  keywordsHref = null
}) {
  const hasMap = Boolean(apiKey && center && Array.isArray(points) && points.length > 0);
  const solvLabel = summary?.solvLabel ?? '—';
  const avgLabel = summary?.avgLabel ?? '—';
  const runDateLabel = summary?.runDate ?? 'No runs yet';
  const keywordLabel = summary?.keyword ?? 'Latest snapshot';
  const statusKey = summary?.status?.key ?? 'unknown';
  const statusLabel = summary?.status?.label ?? 'Unknown';

  return (
    <section className="surface-card surface-card--muted latest-geogrid-card">
      <div className="section-header latest-geogrid-card__header">
        <div>
          <h2 className="section-title">Latest Ranking Report</h2>
          
          <p className="section-caption">
            Review your freshest keyword coverage snapshot across the map.
          </p>

          <div className="section-caption">
            <span>Last Report Run: </span>
            <strong>{runDateLabel}</strong>
          </div>
        </div>
      </div>

      <div className="latest-geogrid-card__status-row">
        <div>
          <div className="section-title">Keyword:</div> <strong className="latest-geogrid-card__keyword">"{keywordLabel}"</strong>
        </div>
      </div>
      <div className="latest-geogrid-card__stats">
        <div className="latest-geogrid-card__stat">
          <span>Avg. position</span>
          <div className="latest-geogrid-card__stat-value">
            <strong>{avgLabel}</strong>
            <TrendIcon direction={summary?.avgTrend} />
          </div>
        </div>
        <div className="latest-geogrid-card__stat">
          <span>SoLV (Top 3)</span>
          <div className="latest-geogrid-card__stat-value">
            <strong>{solvLabel}</strong>
            <TrendIcon direction={summary?.solvTrend} />
          </div>
        </div>
      </div>

      <div className="latest-geogrid-card__map">
        {hasMap ? (
          <GeoGridMap
            apiKey={apiKey}
            center={center}
            points={points}
            interactive={false}
            selectedPointId={null}
            minHeight="clamp(220px, 35vw, 320px)"
          />
        ) : (
          <div className="latest-geogrid-card__placeholder">
            <p>{summary ? 'Geo grid map preview unavailable.' : 'Run a geo grid to unlock this map preview.'}</p>
          </div>
        )}
      </div>

      {keywordsHref ? (
        <Link className="cta-link" href={keywordsHref}>
          View keyword insights ↗
        </Link>
      ) : null}

    </section>
  );
}
