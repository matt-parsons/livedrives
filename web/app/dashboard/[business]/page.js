import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AuthError, requireAuth } from '@/lib/authServer';
import GeoGridRunsSection from './GeoGridRunsSection';
import {
  formatDate,
  formatDecimal,
  formatTrend,
  toTimestamp,
  loadBusiness,
  loadOriginZones,
  loadGeoGridRunSummaries
} from './helpers';

function resolveStatus(status) {
  if (!status) {
    return { key: 'unknown', label: 'Unknown' };
  }

  const value = status.toString();
  const lower = value.toLowerCase();

  if (lower.includes('complete')) {
    return { key: 'completed', label: 'Completed' };
  }

  if (lower.includes('progress') || lower.includes('running')) {
    return { key: 'in_progress', label: 'In progress' };
  }

  if (lower.includes('fail') || lower.includes('error')) {
    return { key: 'failed', label: 'Failed' };
  }

  if (lower.includes('pend') || lower.includes('queue') || lower.includes('schedule')) {
    return { key: 'pending', label: 'Pending' };
  }

  return { key: 'unknown', label: value.replace(/_/g, ' ') };
}

function formatCoordinate(value, digits = 5) {
  if (value === null || value === undefined) {
    return null;
  }

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return String(value);
  }

  return formatDecimal(numericValue, digits);
}

function buildCoordinatePair(lat, lng, digits = 5) {
  const latFormatted = formatCoordinate(lat, digits);
  const lngFormatted = formatCoordinate(lng, digits);

  if (!latFormatted || !lngFormatted) {
    return null;
  }

  return `${latFormatted}, ${lngFormatted}`;
}

export default async function BusinessDashboardPage({ params, searchParams }) {
  const identifier = params.business;
  const viewMode = searchParams?.view === 'list' ? 'list' : 'trend';
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
      const firstAvg = first?.avgPositionValue ?? null;
      const latestAvg = latest?.avgPositionValue ?? null;
      const firstSolv = first?.solvTop3Value ?? null;
      const latestSolv = latest?.solvTop3Value ?? null;

      return {
        key: entry.key,
        keyword: entry.label,
        runCount: runs.length,
        firstRunDate: formatDate(firstRunDateValue),
        latestRunDate: formatDate(latestRunDateValue),
        firstRunDateValue,
        latestRunDateValue,
        latestRunId: latest?.id ?? null,
        avgTrend: formatTrend(firstAvg, latestAvg, 2),
        avgFirst: firstAvg,
        avgLatest: latestAvg,
        avgDelta: firstAvg !== null && latestAvg !== null ? latestAvg - firstAvg : null,
        solvTrend: formatTrend(firstSolv, latestSolv, 1, '%'),
        solvFirst: firstSolv,
        solvLatest: latestSolv,
        solvDelta: firstSolv !== null && latestSolv !== null ? latestSolv - firstSolv : null,
        latestStatus: latest?.status ?? 'unknown'
      };
    });

    entries.sort((a, b) => toTimestamp(b.latestRunDateValue) - toTimestamp(a.latestRunDateValue));

    return entries.map(({ firstRunDateValue, latestRunDateValue, ...rest }) => rest);
  })();
  const createdAt = formatDate(business.createdAt);
  const updatedAt = formatDate(business.updatedAt);
  const businessStatus = business.isActive ? { key: 'active', label: 'Active' } : { key: 'inactive', label: 'Inactive' };
  const businessName = business.businessName || 'Business Dashboard';
  const destination = business.destinationAddress
    ? `${business.destinationAddress}${business.destinationZip ? `, ${business.destinationZip}` : ''}`
    : null;
  const destinationCoordinates = buildCoordinatePair(business.destLat, business.destLng);
  const highlightTiles = [
    { label: 'Geo Grid Runs', value: geoGridRuns.length },
    { label: 'Origin Zones', value: originZones.length },
    { label: 'Business Status', value: businessStatus.label, status: businessStatus.key }
  ];

  if (business.drivesPerDay !== null && business.drivesPerDay !== undefined) {
    highlightTiles.push({ label: 'Drives / day', value: business.drivesPerDay });
  }

  const infoBlocks = [
    { label: 'Business ID', value: business.id },
    business.businessSlug ? { label: 'Slug', value: business.businessSlug } : null,
    business.mid ? { label: 'MID', value: business.mid } : null,
    business.timezone ? { label: 'Timezone', value: business.timezone } : null,
    destination ? { label: 'Destination', value: destination } : null,
    destinationCoordinates ? { label: 'Destination coordinates', value: destinationCoordinates } : null,
    createdAt ? { label: 'Created', value: createdAt } : null,
    updatedAt ? { label: 'Updated', value: updatedAt } : null
  ].filter(Boolean);
  const geoSectionCaption = geoGridRuns.length === 0
    ? 'Launch your first geo grid run to start mapping local rankings.'
    : 'Switch between detailed runs and keyword trend arcs to track performance.';
  const geoGridRunsList = geoGridRuns.map((run) => {
    const status = resolveStatus(run.status);
    const solvTop3 = run.solvTop3 ? `${run.solvTop3}%` : '—';
    const avgPosition = run.avgPosition ?? '—';
    const runDate = run.runDate ?? '—';
    const lastMeasured = run.lastMeasuredAt ? `Last point ${run.lastMeasuredAt}` : null;
    const gridDetails = [
      `Grid: ${run.gridRows ?? '—'} × ${run.gridCols ?? '—'}`,
      run.spacingMiles !== null && run.spacingMiles !== undefined
        ? `Spacing: ${formatDecimal(run.spacingMiles, 2) ?? run.spacingMiles} mi`
        : null,
      run.radiusMiles !== null && run.radiusMiles !== undefined
        ? `Radius: ${formatDecimal(run.radiusMiles, 2) ?? run.radiusMiles} mi`
        : null
    ].filter(Boolean);
    const footerDetails = [
      `Run ID: ${run.id}`,
      lastMeasured,
      run.originLat !== null && run.originLng !== null
        ? `Origin: ${buildCoordinatePair(run.originLat, run.originLng)}`
        : null,
      `Ranked points: ${run.rankedPoints ?? 0} of ${run.totalPoints ?? 0}`
    ].filter(Boolean);

    return {
      id: run.id,
      keyword: run.keyword || 'Untitled grid run',
      href: `${baseHref}/runs/${run.id}`,
      runDate,
      status,
      solvTop3,
      avgPosition,
      gridDetails,
      footerDetails,
      notes: run.notes || null
    };
  });
  const geoGridTrendList = geoGridTrend.map((item) => ({
    key: item.key,
    keyword: item.keyword,
    runCount: item.runCount,
    firstRunDate: item.firstRunDate,
    latestRunDate: item.latestRunDate,
    latestRunHref: item.latestRunId ? `${baseHref}/runs/${item.latestRunId}` : null,
    status: resolveStatus(item.latestStatus),
    avg: {
      first: item.avgFirst,
      latest: item.avgLatest,
      delta: item.avgDelta
    },
    solv: {
      first: item.solvFirst,
      latest: item.solvLatest,
      delta: item.solvDelta
    }
  }));
  const originSectionCaption = originZones.length === 0
    ? 'Define origin zones to balance coverage and routing priorities.'
    : 'Targeted pickup regions shaping this business’s live operations.';

  return (
    <div className="page-shell">
      <nav className="page-nav" aria-label="Breadcrumb">
        <Link className="back-link" href="/dashboard">
          ← Command central
        </Link>
      </nav>

      <section className="page-header">
        <h1 className="page-title">{businessName}</h1>
        <p className="page-subtitle">
          Operational intelligence for this business. Review configured zones, geo grid performance, and CTR
          activity in one focused view.
        </p>
      </section>

      <section className="section">
        <div className="surface-card surface-card--muted surface-card--compact">
          <div className="section-header">
            <h2 className="section-title">CTR sessions</h2>
            <p className="section-caption">Analyze click-through behaviors alongside geo performance.</p>
          </div>

          <Link className="cta-link" href={ctrHref}>
            Open CTR dashboard ↗
          </Link>
        </div>
      </section>

      <section className="section">
        <GeoGridRunsSection
          caption={geoSectionCaption}
          defaultView={viewMode}
          trendItems={geoGridTrendList}
          runItems={geoGridRunsList}
        />
      </section>

      <section className="section">
        <div className="surface-card surface-card--muted">
          <div className="section-header">
            <h2 className="section-title">Business overview</h2>
            <p className="section-caption">Current state and identifiers powering live operations.</p>
          </div>

          <div className="account-details account-details--compact">
            {highlightTiles.map((tile) => (
              <div className="detail-tile detail-tile--contrast" key={tile.label}>
                <strong>{tile.label}</strong>
                {tile.status ? (
                  <span className="status-pill" data-status={tile.status}>
                    {tile.value}
                  </span>
                ) : (
                  <span>{tile.value}</span>
                )}
              </div>
            ))}
          </div>

          {infoBlocks.length ? (
            <div className="info-grid">
              {infoBlocks.map((item) => (
                <div className="info-block" key={item.label}>
                  <span className="info-label">{item.label}</span>
                  <span className="info-value">{item.value}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section className="section">
        <div className="surface-card surface-card--muted">
          <div className="section-header">
            <h2 className="section-title">Origin zones</h2>
            <p className="section-caption">{originSectionCaption}</p>
          </div>

          {originZones.length === 0 ? (
            <div className="empty-state">
              <div>
                <h3>Origin strategy pending</h3>
                <p>Set up origin zones to activate balanced pickup coverage and routing logic.</p>
              </div>
            </div>
          ) : (
            <ul className="card-list card-list--grid zone-grid">
              {originZones.map((zone) => {
                const zoneCreatedAt = formatDate(zone.createdAt);
                const zoneRadius =
                  zone.radiusMi !== null && zone.radiusMi !== undefined
                    ? `${formatDecimal(zone.radiusMi, 1) ?? zone.radiusMi} mi radius`
                    : null;
                const zoneCoords = buildCoordinatePair(zone.lat, zone.lng);

                return (
                  <li key={zone.id}>
                    <div className="list-card zone-card">
                      <div className="list-card-header">
                        <h3 className="list-card-title">{zone.name || 'Unnamed zone'}</h3>
                        {zone.weight !== null && zone.weight !== undefined ? (
                          <span className="metric-chip">
                            <strong>{formatDecimal(zone.weight, 1) ?? zone.weight}</strong> weight
                          </span>
                        ) : null}
                      </div>

                      <div className="zone-card__meta">
                        {zone.canonical ? <span>{zone.canonical}</span> : null}
                        {zone.zip ? <span>ZIP {zone.zip}</span> : null}
                        {zoneRadius ? <span>{zoneRadius}</span> : null}
                      </div>

                      <div className="zone-card__grid">
                        {zoneCoords ? <div>Coordinates: {zoneCoords}</div> : null}
                        {zone.keywords ? <div>Keywords: {zone.keywords}</div> : null}
                        {zoneCreatedAt ? <div>Created: {zoneCreatedAt}</div> : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

    </div>
  );
}
