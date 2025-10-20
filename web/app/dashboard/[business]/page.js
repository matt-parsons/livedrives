import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Button, Card, CardBody, CardHeader, Chip, Divider } from '@heroui/react';
import { AuthError, requireAuth } from '@/lib/authServer';
import GeoGridRunsSection from './GeoGridRunsSection';
import OriginZonesManager from './OriginZonesManager';
import KeywordPerformanceSpotlight from './KeywordPerformanceSpotlight';
import BusinessOptimizationRoadmap from './BusinessOptimizationRoadmap';
import BusinessSwitcher from './BusinessSwitcher';
import {
  formatDate,
  formatDecimal,
  formatTrend,
  toTimestamp,
  loadBusiness,
  loadOriginZones,
  loadGeoGridRunSummaries,
  loadGeoGridRunWithPoints,
  loadCtrKeywordOverview,
  loadOrganizationBusinesses
} from './helpers';
import { buildOptimizationRoadmap } from './optimization';
import { fetchPlaceDetails } from '@/lib/googlePlaces';
import { buildMapPoints, resolveCenter } from './runs/formatters';

function resolveMapsApiKey() {
  return process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? process.env.GOOGLE_API_KEY ?? null;
}

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
  const editHref = `${baseHref}/edit`;

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
  const isOwner = session.role === 'owner';

  let ownerBusinessOptions = [];

  if (isOwner) {
    const organizationBusinesses = await loadOrganizationBusinesses(session.organizationId);

    ownerBusinessOptions = organizationBusinesses.map((entry) => ({
      id: entry.id,
      value: entry.businessSlug ?? String(entry.id),
      label: entry.businessName || `Business #${entry.id}`,
      isActive: entry.isActive
    }));
  }

  if (!business) {
    notFound();
  }

  let optimizationRoadmap = null;
  let optimizationError = null;

  if (business.gPlaceId) {
    try {
      const { place } = await fetchPlaceDetails(business.gPlaceId);
      optimizationRoadmap = buildOptimizationRoadmap(place);
    } catch (error) {
      optimizationError = error?.message ?? 'Failed to load Google Places details.';
    }
  }

  const originZones = await loadOriginZones(business.id);
  const ctrOverview = await loadCtrKeywordOverview(business.id, 30);
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
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const nowTimestamp = Date.now();
  const recentKeywordRuns = new Map();

  for (const run of geoGridRuns) {
    const timestamp = toTimestamp(run.runDateValue);

    if (!timestamp || nowTimestamp - timestamp > THIRTY_DAYS_MS) {
      continue;
    }

    const keywordLabel = run.keyword ?? '(no keyword)';
    const key = keywordLabel.trim().toLowerCase() || '__no_keyword__';

    if (!recentKeywordRuns.has(key)) {
      recentKeywordRuns.set(key, []);
    }

    recentKeywordRuns.get(key).push({ run, timestamp });
  }

  const keywordPerformance30d = Array.from(recentKeywordRuns.entries())
    .map(([key, entries]) => {
      const sorted = entries.slice().sort((a, b) => a.timestamp - b.timestamp);
      const firstEntry = sorted[0];
      const latestEntry = sorted[sorted.length - 1];
      const firstRun = firstEntry.run;
      const latestRun = latestEntry.run;
      const firstAvg = firstRun.avgPositionValue ?? null;
      const latestAvg = latestRun.avgPositionValue ?? null;
      const firstSolv = firstRun.solvTop3Value ?? null;
      const latestSolv = latestRun.solvTop3Value ?? null;
      const avgDelta = firstAvg !== null && latestAvg !== null ? latestAvg - firstAvg : null;
      const solvDelta = firstSolv !== null && latestSolv !== null ? latestSolv - firstSolv : null;
      const avgDeltaAbs = avgDelta !== null ? formatDecimal(Math.abs(avgDelta), 2) : null;
      const avgDeltaLabel = avgDeltaAbs !== null
        ? `${avgDelta > 0 ? '+' : avgDelta < 0 ? '-' : ''}${avgDeltaAbs}`
        : null;
      const solvDeltaAbs = solvDelta !== null ? formatDecimal(Math.abs(solvDelta), 1) : null;
      const solvDeltaLabel = solvDeltaAbs !== null
        ? `${solvDelta > 0 ? '+' : solvDelta < 0 ? '-' : ''}${solvDeltaAbs}%`
        : null;

      return {
        key,
        keyword: latestRun.keyword || '(no keyword)',
        runCount: sorted.length,
        latestRunDate: latestRun.runDate ?? '—',
        latestRunId: latestRun.id ?? null,
        latestRunHref: latestRun.id ? `${baseHref}/runs/${latestRun.id}` : null,
        avgLabel: latestRun.avgPosition ?? '—',
        avgTrendIndicator: buildRunTrendIndicator(avgDelta, { invert: true, digits: 2 }),
        avgDeltaLabel,
        solvLabel: latestRun.solvTop3 ? `${latestRun.solvTop3}%` : '—',
        solvTrendIndicator: buildRunTrendIndicator(solvDelta, { unit: '%', digits: 1 }),
        solvDeltaLabel,
        latestTimestamp: latestEntry.timestamp
      };
    })
    .sort((a, b) => b.latestTimestamp - a.latestTimestamp)
    .map(({ latestTimestamp, ...rest }) => rest);

  const mapsApiKey = resolveMapsApiKey();
  const keywordPerformanceItems = keywordPerformance30d.length
    ? await Promise.all(
        keywordPerformance30d.map(async (item) => {
          if (!item.latestRunId || !mapsApiKey) {
            return { ...item, latestRunMap: null };
          }

          try {
            const runData = await loadGeoGridRunWithPoints(business.id, item.latestRunId);

            if (!runData) {
              return { ...item, latestRunMap: null };
            }

            const mapPoints = buildMapPoints(runData.points);
            const center = resolveCenter(runData.run, mapPoints);

            if (!center) {
              return { ...item, latestRunMap: null };
            }

            return {
              ...item,
              latestRunMap: {
                center,
                points: mapPoints
              }
            };
          } catch (error) {
            return { ...item, latestRunMap: null };
          }
        })
      )
    : [];
  function buildRunTrendIndicator(delta, { invert = false, unit = '', digits = 1 } = {}) {
    if (delta === null || delta === undefined) {
      return null;
    }

    const value = Number(delta);

    if (!Number.isFinite(value)) {
      return null;
    }

    const magnitudeStr = formatDecimal(Math.abs(value), digits);

    if (magnitudeStr === null) {
      return null;
    }

    const magnitudeNumeric = Number(magnitudeStr);

    if (Number.isNaN(magnitudeNumeric)) {
      return null;
    }

    const isImproving = invert ? value < 0 : value > 0;
    const isDeclining = invert ? value > 0 : value < 0;

    if (magnitudeNumeric === 0) {
      return {
        className: 'trend-indicator--neutral',
        icon: '→',
        text: `0${unit}`,
        title: 'No change'
      };
    }

    let className = 'trend-indicator--neutral';
    let icon = '→';
    let title = 'No change';

    if (isImproving) {
      className = 'trend-indicator--positive';
      icon = invert ? '▼' : '▲';
      title = 'Improving';
    } else if (isDeclining) {
      className = 'trend-indicator--negative';
      icon = invert ? '▲' : '▼';
      title = 'Declining';
    }

    const prefix = value > 0 ? '+' : '-';
    const text = `${prefix}${magnitudeStr}${unit}`;

    return { className, icon, text, title };
  }
  const runTrendComparisons = new Map();
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
      let previous = null;

      for (const run of runs) {
        let avgDeltaToPrevious = null;
        let solvDeltaToPrevious = null;

        if (previous) {
          if (
            run.avgPositionValue !== null &&
            run.avgPositionValue !== undefined &&
            previous.avgPositionValue !== null &&
            previous.avgPositionValue !== undefined
          ) {
            avgDeltaToPrevious = run.avgPositionValue - previous.avgPositionValue;
          }

          if (
            run.solvTop3Value !== null &&
            run.solvTop3Value !== undefined &&
            previous.solvTop3Value !== null &&
            previous.solvTop3Value !== undefined
          ) {
            solvDeltaToPrevious = run.solvTop3Value - previous.solvTop3Value;
          }
        }

        runTrendComparisons.set(run.id, {
          avgDelta: avgDeltaToPrevious,
          solvDelta: solvDeltaToPrevious
        });

        previous = run;
      }

      const first = runs[0];
      const latest = runs[runs.length - 1];
      const firstRunDateValue = first?.runDateValue ?? null;
      const latestRunDateValue = latest?.runDateValue ?? null;
      const firstAvg = first?.avgPositionValue ?? null;
      const latestAvg = latest?.avgPositionValue ?? null;
      const firstSolv = first?.solvTop3Value ?? null;
      const latestSolv = latest?.solvTop3Value ?? null;
      const avgDelta = firstAvg !== null && latestAvg !== null ? latestAvg - firstAvg : null;
      const solvDelta = firstSolv !== null && latestSolv !== null ? latestSolv - firstSolv : null;
      const avgTrendIndicator = buildRunTrendIndicator(avgDelta, { invert: true, digits: 2 });
      const solvTrendIndicator = buildRunTrendIndicator(solvDelta, { unit: '%', digits: 1 });

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
        avgDelta,
        solvTrend: formatTrend(firstSolv, latestSolv, 1, '%'),
        solvFirst: firstSolv,
        solvLatest: latestSolv,
        solvDelta,
        avgTrendIndicator,
        solvTrendIndicator,
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
  const currentBusinessOptionValue = business.businessSlug ?? String(business.id);
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
  const businessOverviewItems = [
    ...highlightTiles.map((tile) => ({
      key: tile.label,
      label: tile.label,
      value: tile.value,
      status: tile.status ?? null
    })),
    ...infoBlocks.map((item) => ({
      key: item.label,
      label: item.label,
      value: item.value,
      status: null
    }))
  ];
  const geoSectionCaption = geoGridRuns.length === 0
    ? 'Launch your first geo grid run to start mapping local rankings.'
    : 'Switch between detailed runs and keyword trend arcs to track performance.';
  const trendMeta = {
    positive: { label: 'Improving', fg: '#1a7431', bg: 'rgba(26, 116, 49, 0.12)', tone: 'success' },
    negative: { label: 'Declining', fg: '#b91c1c', bg: 'rgba(185, 28, 28, 0.12)', tone: 'danger' },
    neutral: { label: 'Stable', fg: '#4b5563', bg: 'rgba(75, 85, 99, 0.12)', tone: 'secondary' }
  };
  const ctrOverviewRows = ctrOverview.map((item) => {
    const avgLabel = item.avgPosition != null ? formatDecimal(item.avgPosition, 2) : '—';
    const solvLabel = item.solvTop3 != null ? `${formatDecimal(item.solvTop3, 1)}%` : '—';

    const avgTrendConfig = trendMeta[item.avgTrend] ?? trendMeta.neutral;
    const avgDeltaLabel = item.avgDelta != null
      ? `${item.avgDelta > 0 ? '+' : item.avgDelta < 0 ? '-' : ''}${formatDecimal(Math.abs(item.avgDelta), 2)}`
      : null;

    const solvTrendConfig = trendMeta[item.solvTrend] ?? trendMeta.neutral;
    const solvDeltaLabel = item.solvDelta != null
      ? `${item.solvDelta > 0 ? '+' : item.solvDelta < 0 ? '-' : ''}${formatDecimal(Math.abs(item.solvDelta), 1)}%`
      : null;

    return {
      keyword: item.keyword,
      sessions: item.sessions,
      avgLabel,
      avgDeltaLabel,
      avgTone: { label: avgTrendConfig.label, color: avgTrendConfig.tone },
      solvLabel,
      solvDeltaLabel,
      solvTone: { label: solvTrendConfig.label, color: solvTrendConfig.tone }
    };
  });
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
    const trends = runTrendComparisons.get(run.id) ?? { avgDelta: null, solvDelta: null };
    const solvTrendIndicator = buildRunTrendIndicator(trends.solvDelta, { unit: '%', digits: 1 });
    const avgTrendIndicator = buildRunTrendIndicator(trends.avgDelta, { invert: true, digits: 2 });

    return {
      id: run.id,
      keyword: run.keyword || 'Untitled grid run',
      href: `${baseHref}/runs/${run.id}`,
      runDate,
      status,
      solvTop3,
      solvTrendIndicator,
      avgPosition,
      avgTrendIndicator,
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
    avgTrendIndicator: item.avgTrendIndicator,
    solvTrendIndicator: item.solvTrendIndicator,
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

  const showBusinessSwitcher = isOwner && ownerBusinessOptions.length > 0;
  const businessStatusTone = businessStatus.key === 'active' ? 'success' : 'warning';

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      {showBusinessSwitcher ? (
        <Card className="border border-content3/40 bg-content1/80 shadow-sm">
          <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-foreground/50">Switch business</p>
              <p className="text-sm text-foreground/60">
                Jump between managed locations without leaving the dashboard.
              </p>
            </div>
            <div className="w-full max-w-sm">
              <BusinessSwitcher businesses={ownerBusinessOptions} currentValue={currentBusinessOptionValue} />
            </div>
          </CardBody>
        </Card>
      ) : null}

      <Card className="border border-content3/40 bg-content1/90 shadow-large">
        <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold text-foreground">{businessName}</h1>
            <p className="max-w-2xl text-sm text-foreground/60">
              Operational intelligence for this business. Review configured zones, geo grid performance, and CTR
              activity in one focused view.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Chip color={businessStatusTone} variant="flat" className="font-semibold">
              {businessStatus.label}
            </Chip>
            {isOwner ? (
              <Button as={Link} href={editHref} variant="bordered" color="secondary">
                Edit business
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <Divider />
        <CardBody className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {businessOverviewItems.map((item) => (
              <div key={item.key} className="rounded-2xl border border-content3/40 bg-content2/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground/50">{item.label}</p>
                <div className="mt-2 text-xl font-semibold text-foreground">
                  {item.status ? (
                    <Chip color={item.status === 'active' ? 'success' : 'warning'} variant="flat" className="font-semibold">
                      {item.value}
                    </Chip>
                  ) : (
                    item.value
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      {keywordPerformanceItems.length ? (
        <KeywordPerformanceSpotlight items={keywordPerformanceItems} mapsApiKey={mapsApiKey} />
      ) : (
        <Card className="border border-dashed border-content3/50 bg-content2/70">
          <CardHeader>
            <h2 className="text-xl font-semibold text-foreground">Profile performance</h2>
          </CardHeader>
          <Divider />
          <CardBody className="text-sm text-foreground/70">
            Not enough geo grid runs have been recorded in the last 30 days to chart keyword movement. Launch additional
            runs to populate this spotlight.
          </CardBody>
        </Card>
      )}

      <GeoGridRunsSection
        caption={geoSectionCaption}
        defaultView={viewMode}
        trendItems={geoGridTrendList}
        runItems={geoGridRunsList}
      />

      <BusinessOptimizationRoadmap
        roadmap={optimizationRoadmap}
        error={optimizationError}
        placeId={business.gPlaceId}
        editHref={editHref}
      />

      {isOwner ? (
        <Card className="border border-content3/40 bg-content1/90 shadow-large">
          <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-foreground">CTR sessions</h2>
              <p className="text-sm text-foreground/60">Analyze click-through behaviours alongside geo performance.</p>
            </div>
            <Button as={Link} href={ctrHref} variant="bordered" color="secondary">
              Open CTR dashboard
            </Button>
          </CardHeader>
          <Divider />
          <CardBody className="space-y-4">
            {ctrOverviewRows.length ? (
              <div className="grid gap-3">
                {ctrOverviewRows.map((item) => (
                  <div
                    key={item.keyword}
                    className="rounded-2xl border border-content3/40 bg-content2/70 p-4"
                  >
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-lg font-semibold text-foreground">{item.keyword}</p>
                        <p className="text-xs uppercase tracking-wide text-foreground/50">
                          {item.sessions} session{item.sessions === 1 ? '' : 's'} (30 days)
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <Chip color={item.avgTone.color} variant="flat" size="sm" className="font-semibold">
                          Avg position {item.avgLabel}
                          {item.avgTone.label ? ` · ${item.avgTone.label}` : ''}
                          {item.avgDeltaLabel ? ` (${item.avgDeltaLabel})` : ''}
                        </Chip>
                        <Chip color={item.solvTone.color} variant="flat" size="sm" className="font-semibold">
                          SoLV {item.solvLabel}
                          {item.solvTone.label ? ` · ${item.solvTone.label}` : ''}
                          {item.solvDeltaLabel ? ` (${item.solvDeltaLabel})` : ''}
                        </Chip>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-foreground/60">No CTR sessions recorded in the last 30 days.</p>
            )}
          </CardBody>
        </Card>
      ) : null}

      {isOwner ? (
        <OriginZonesManager
          businessId={business.id}
          initialZones={originZones}
          caption={originSectionCaption}
        />
      ) : null}
    </div>
  );
}
