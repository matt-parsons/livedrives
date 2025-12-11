'use client';

import Link from 'next/link';
import GeoGridMap from './runs/[runId]/GeoGridMap';
import SummaryMetricCard from './SummaryMetricCard';

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
  const keywordLabel = summary?.keyword ?? '';
  const hasKeyword = Boolean(keywordLabel?.trim());
  const statusKey = summary?.status?.key ?? 'unknown';
  const statusLabel = summary?.status?.label ?? 'Unknown';
  const isReportInProgress = statusKey === 'in_progress';
  const summaryCards = [
    {
      id: 'avg',
      title: 'Average position',
      valueLabel: avgLabel,
      indicator: summary?.avgTrendIndicator ?? null,
      deltaLabel: summary?.avgDeltaLabel ?? null
    },
    {
      id: 'solv',
      title: 'SoLV (Top 3)',
      valueLabel: solvLabel,
      indicator: summary?.solvTrendIndicator ?? null,
      deltaLabel: summary?.solvDeltaLabel ?? null
    }
  ];

  return (
    <section className="surface-card surface-card--muted latest-geogrid-card">
      {hasKeyword ? (
        <>
          <div className="latest-geogrid-card__status-row">
            <div>
              <div className="section-title">Your Latest Ranking Heat Map</div>{' '}
              <strong className="latest-geogrid-card__keyword">Keyword: &quot;{keywordLabel}&quot;</strong>
            </div>
            {keywordsHref ? (
              <Link className="cta-link" href={keywordsHref}>
                View keyword insights ↗
              </Link>
            ) : null}
          </div>
          <div className="latest-geogrid-card__stats">
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

          <div className="latest-geogrid-card__map">
            {hasMap ? (
              <>
                <GeoGridMap
                  apiKey={apiKey}
                  center={center}
                  points={points}
                  interactive={false}
                  selectedPointId={null}
                  minHeight="clamp(220px, 35vw, 320px)"
                />
                {isReportInProgress ? (
                  <div className="latest-geogrid-card__map-overlay">
                    <div>
                      <p className="latest-geogrid-card__map-overlay-title">
                        Ranking report in progress
                      </p>
                      <p className="latest-geogrid-card__map-overlay-copy">
                        We&apos;ll show the refreshed ranking heat map once the report finishes.
                      </p>
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="latest-geogrid-card__placeholder">
                <p>
                  {summary
                    ? 'Local ranking report map preview unavailable.'
                    : "We're running your your first ranking report now, once it is done it will unlock this map preview."}
                </p>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="latest-geogrid-card__empty-state">
          <p>
            Confirm your keyword you want to track and check back here for the first ranking report.
          </p>
        </div>
      )}
    </section>
  );
}
