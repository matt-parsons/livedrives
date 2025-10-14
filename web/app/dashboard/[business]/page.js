import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AuthError, requireAuth } from '@/lib/authServer';
import {
  formatDate,
  formatDecimal,
  formatTrend,
  toTimestamp,
  loadBusiness,
  loadOriginZones,
  loadGeoGridRunSummaries
} from './helpers';

export default async function BusinessDashboardPage({ params, searchParams }) {
  const identifier = params.business;
  const viewMode = searchParams?.view === 'trend' ? 'trend' : 'list';
  const baseHref = `/dashboard/${encodeURIComponent(identifier)}`;
  const ctrHref = `${baseHref}/ctr`;

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

  const originZones = await loadOriginZones(business.id);
  const geoGridRunsRaw = await loadGeoGridRunSummaries(business.id);
  const geoGridRuns = geoGridRunsRaw.map((run) => {
    const rankedPoints = Number(run.rankedPoints ?? 0);
    const top3Points = Number(run.top3Points ?? 0);
    const avgPositionValue = run.avgRank === null || run.avgRank === undefined ? null : Number(run.avgRank);
    const avgPosition = avgPositionValue === null ? null : formatDecimal(avgPositionValue, 2);
    const solvValue = rankedPoints > 0 ? (top3Points * 100) / rankedPoints : null;
    const solvTop3 = solvValue === null ? null : formatDecimal(solvValue, 1);
    const runDateValue = run.finishedAt ?? run.lastMeasuredAt ?? run.createdAt;
    const lastMeasuredAtValue = run.lastMeasuredAt ?? null;
    const finishedAtValue = run.finishedAt ?? null;
    const createdAtValue = run.createdAt ?? null;

    return {
      ...run,
      rankedPoints,
      top3Points,
      avgPositionValue,
      avgPosition,
      solvTop3Value: solvValue,
      solvTop3,
      runDateValue,
      runDate: formatDate(runDateValue),
      lastMeasuredAtValue,
      lastMeasuredAt: formatDate(lastMeasuredAtValue),
      finishedAtValue,
      finishedAt: formatDate(finishedAtValue),
      createdAtValue,
      createdAt: formatDate(createdAtValue)
    };
  });
  const geoGridTrend = (() => {
    if (!geoGridRuns.length) {
      return [];
    }

    const grouped = new Map();

    for (const run of geoGridRuns) {
      const keywordLabel = run.keyword ?? '(no keyword)';
      const key = keywordLabel.trim().toLowerCase() || '__no_keyword__';

      if (!grouped.has(key)) {
        grouped.set(key, { key, label: keywordLabel, runs: [] });
      }

      grouped.get(key).runs.push(run);
    }

    const entries = Array.from(grouped.values()).map((entry) => {
      const runs = entry.runs.slice().sort((a, b) => toTimestamp(a.runDateValue) - toTimestamp(b.runDateValue));
      const first = runs[0];
      const latest = runs[runs.length - 1];
      const firstRunDateValue = first?.runDateValue ?? null;
      const latestRunDateValue = latest?.runDateValue ?? null;

      return {
        key: entry.key,
        keyword: entry.label,
        runCount: runs.length,
        firstRunDate: formatDate(firstRunDateValue),
        latestRunDate: formatDate(latestRunDateValue),
        firstRunDateValue,
        latestRunDateValue,
        latestRunId: latest?.id ?? null,
        avgTrend: formatTrend(first?.avgPositionValue ?? null, latest?.avgPositionValue ?? null, 2),
        solvTrend: formatTrend(first?.solvTop3Value ?? null, latest?.solvTop3Value ?? null, 1, '%'),
        latestStatus: latest?.status ?? 'unknown'
      };
    });

    entries.sort((a, b) => toTimestamp(b.latestRunDateValue) - toTimestamp(a.latestRunDateValue));

    return entries.map(({ firstRunDateValue, latestRunDateValue, latestRunId, ...rest }) => ({
      ...rest,
      latestRunId
    }));
  })();
  const createdAt = formatDate(business.createdAt);
  const updatedAt = formatDate(business.updatedAt);

  return (
    <div className="business-dashboard">
      <nav className="business-dashboard__nav">
        <Link href="/dashboard">Back to dashboard</Link>
      </nav>
      <h1>{business.businessName || 'Business Dashboard'}</h1>

      <section>
        <h2>Details</h2>
        <p>Business ID: <strong>{business.id}</strong></p>
        {business.businessSlug ? <p>Slug: <strong>{business.businessSlug}</strong></p> : null}
        {business.mid ? <p>MID: <strong>{business.mid}</strong></p> : null}
        <p>Status: <strong>{business.isActive ? 'Active' : 'Inactive'}</strong></p>
        {business.drivesPerDay !== null && business.drivesPerDay !== undefined ? (
          <p>Drives per day: <strong>{business.drivesPerDay}</strong></p>
        ) : null}
        {business.timezone ? <p>Timezone: <strong>{business.timezone}</strong></p> : null}
        {business.destinationAddress ? (
          <p>
            Destination: <strong>{business.destinationAddress}</strong>
            {business.destinationZip ? `, ${business.destinationZip}` : ''}
          </p>
        ) : null}
        {business.destLat !== null && business.destLng !== null ? (
          <p>
            Destination Coordinates: <strong>{business.destLat}</strong>, <strong>{business.destLng}</strong>
          </p>
        ) : null}
      </section>

      <section>
        <h2>Metadata</h2>
        {createdAt ? <p>Created: <strong>{createdAt}</strong></p> : null}
        {updatedAt ? <p>Updated: <strong>{updatedAt}</strong></p> : null}
      </section>

      <section>
        <h2>Origin Zones</h2>
        {originZones.length === 0 ? (
          <p>No origin zones configured.</p>
        ) : (
          <ul>
            {originZones.map((zone) => {
              const zoneCreatedAt = formatDate(zone.createdAt);

              return (
                <li key={zone.id}>
                  <strong>{zone.name || 'Unnamed Zone'}</strong>
                  {zone.canonical ? <div>Canonical: {zone.canonical}</div> : null}
                  {zone.zip ? <div>ZIP: {zone.zip}</div> : null}
                  {zone.radiusMi !== null && zone.radiusMi !== undefined ? (
                    <div>Radius (mi): {zone.radiusMi}</div>
                  ) : null}
                  {(zone.lat !== null && zone.lng !== null) ? (
                    <div>Coordinates: {zone.lat}, {zone.lng}</div>
                  ) : null}
                  {zone.weight !== null && zone.weight !== undefined ? <div>Weight: {zone.weight}</div> : null}
                  {zone.keywords ? <div>Keywords: {zone.keywords}</div> : null}
                  {zoneCreatedAt ? <div>Created: {zoneCreatedAt}</div> : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2>CTR Sessions</h2>
        <p>Review recent click-through runs and performance trends.</p>
        <Link href={ctrHref}>View CTR dashboard</Link>
      </section>

      <section>
        <div>
          <h2>Geo Grid Runs</h2>
          <p>
            View:{' '}
            {viewMode === 'list' ? (
              <strong>Detailed</strong>
            ) : (
              <Link href={baseHref}>Detailed</Link>
            )}
            {' | '}
            {viewMode === 'trend' ? (
              <strong>Keyword Trend</strong>
            ) : (
              <Link href={`${baseHref}?view=trend`}>Keyword Trend</Link>
            )}
          </p>
        </div>
        {viewMode === 'trend' ? (
          geoGridTrend.length === 0 ? (
            <p>No geo grid runs yet.</p>
          ) : (
            <ul>
              {geoGridTrend.map((item) => (
                <li key={item.key}>
                  <strong>{item.keyword}</strong>
                  <div>Runs tracked: {item.runCount}</div>
                  <div>Avg Position: {item.avgTrend}</div>
                  <div>SoLV (Top 3): {item.solvTrend}</div>
                  <div>
                    First run: {item.firstRunDate ?? '—'} | Latest run: {item.latestRunDate ?? '—'}
                    {item.latestRunId ? (
                      <>
                        {' ('}
                        <Link href={`${baseHref}/runs/${item.latestRunId}`}>View run</Link>
                        {')'}
                      </>
                    ) : null}
                  </div>
                  <div>Latest status: {item.latestStatus}</div>
                </li>
              ))}
            </ul>
          )
        ) : geoGridRuns.length === 0 ? (
          <p>No geo grid runs yet.</p>
        ) : (
          <ul>
            {geoGridRuns.map((run) => (
              <li key={run.id}>
                <Link href={`${baseHref}/runs/${run.id}`} className="geo-grid-run-link">
                  <strong>{run.keyword || 'Untitled Grid Run'}</strong>
                  <div>Status: {run.status || 'unknown'}</div>
                  <div>
                    SoLV (Top 3): {run.solvTop3 ? `${run.solvTop3}%` : '—'} | Avg Position:{' '}
                    {run.avgPosition ?? '—'}
                  </div>
                  <div>
                    Run Date: {run.runDate ?? '—'}
                    {run.lastMeasuredAt ? ` (last point: ${run.lastMeasuredAt})` : ''}
                  </div>
                  <div>
                    Grid: {run.gridRows ?? '—'} × {run.gridCols ?? '—'} | Spacing:{' '}
                    {formatDecimal(run.spacingMiles, 2) ?? '—'} mi | Radius:{' '}
                    {formatDecimal(run.radiusMiles, 2) ?? '—'} mi
                  </div>
                  <div>
                    Points: total {run.totalPoints ?? 0}, ranked {run.rankedPoints ?? 0}
                  </div>
                  {run.originLat !== null && run.originLng !== null ? (
                    <div>
                      Origin: {formatDecimal(run.originLat, 5) ?? run.originLat},{' '}
                      {formatDecimal(run.originLng, 5) ?? run.originLng}
                    </div>
                  ) : null}
                  {run.notes ? <div>Notes: {run.notes}</div> : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
