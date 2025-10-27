import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AuthError, requireAuth } from '@/lib/authServer';
import {
  formatDate,
  formatDecimal,
  loadBusiness,
  loadCtrRunsWithSnapshots,
  loadOrganizationBusinesses
} from '../helpers';
import BusinessNavigation from '../BusinessNavigation';
import BusinessSwitcher from '../BusinessSwitcher';
import BusinessSettingsShortcut from '../BusinessSettingsShortcut';
import CtrMap from './CtrMap';
import TrendChart from './TrendChart';
import SessionList from './SessionList';
import styles from './styles.module.css';

function resolveMapsApiKey() {
  return process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? process.env.GOOGLE_API_KEY ?? null;
}

function toSqlDateTime(value) {
  return value.toISOString().slice(0, 19).replace('T', ' ');
}

function formatRangeLabel(startDate, endDate) {
  const inclusiveEnd = new Date(endDate.getTime() - 1);
  const sameYear = startDate.getUTCFullYear() === inclusiveEnd.getUTCFullYear();
  const options = sameYear
    ? { month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric', year: 'numeric' };
  const formatter = new Intl.DateTimeFormat('en-US', options);
  const startLabel = formatter.format(startDate);
  const endLabel = formatter.format(inclusiveEnd);
  return `${startLabel} – ${endLabel}`;
}

function formatDayLabel(date) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
}

function computeCenter(points) {
  if (!points.length) {
    return null;
  }

  const sum = points.reduce((acc, point) => {
    acc.lat += point.lat;
    acc.lng += point.lng;
    return acc;
  }, { lat: 0, lng: 0 });

  return {
    lat: sum.lat / points.length,
    lng: sum.lng / points.length
  };
}

function dedupePoints(records) {
  const map = new Map();

  for (const record of records) {
    const latValue = record.originLat ?? record.lat;
    const lngValue = record.originLng ?? record.lng;

    if (latValue === null || latValue === undefined || lngValue === null || lngValue === undefined) {
      continue;
    }

    const key = `${latValue}:${lngValue}`;
    const rawRank = record.matchedPosition ?? record.rankPosition;
    const rank = rawRank === null || rawRank === undefined
      ? null
      : Number(rawRank);
    const rankLabel = record.rankLabel
      ? record.rankLabel
      : rank === null
        ? '?'
        : rank > 20
          ? '20+'
          : String(rank);

    const timestampSource = record.timestampUtc ?? record.createdAt ?? record.timestamp;
    const timestamp = timestampSource ? new Date(timestampSource).getTime() : 0;
    const timestampIso = timestampSource ? new Date(timestampSource).toISOString() : null;

    const candidate = {
      lat: Number(latValue),
      lng: Number(lngValue),
      rankPosition: rank,
      rankLabel,
      timestamp,
      timestampIso,
      runId: record.runId ?? null,
      keyword: record.keyword ?? null,
      runDate: record.runDate ?? null,
      startedAt: record.startedAt ?? null,
      finishedAt: record.finishedAt ?? null
    };

    const current = map.get(key);

    if (!current) {
      map.set(key, candidate);
    } else {
      const currentRank = current.rankPosition;
      if (rank === null && currentRank !== null) {
        continue;
      }

      if (rank !== null && (currentRank === null || rank < currentRank || (rank === currentRank && timestamp > current.timestamp))) {
        map.set(key, candidate);
      }
    }
  }

  return Array.from(map.values());
}

function normalizeKeywordLabel(value) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed ? trimmed : '(no keyword)';
}

export default async function CtrDashboardPage({ params, searchParams }) {
  const mapsApiKey = resolveMapsApiKey();

  if (!mapsApiKey) {
    throw new Error('Google Maps API key is required. Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY or GOOGLE_API_KEY.');
  }

  const identifier = params.business;
  const baseHref = `/dashboard/${encodeURIComponent(identifier)}/ctr`;
  const offsetParam = Number.parseInt(searchParams?.offset ?? '0', 10);
  const offset = Number.isFinite(offsetParam) && offsetParam > 0 ? offsetParam : 0;

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

  const canManageSettings = session.role === 'owner' || session.role === 'admin';

  if (session.role !== 'owner') {
    redirect(`/dashboard/${encodeURIComponent(identifier)}`);
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const windowStart = new Date(today);
  windowStart.setUTCDate(windowStart.getUTCDate() - 29 - offset * 30);

  const windowEnd = new Date(today);
  windowEnd.setUTCDate(windowEnd.getUTCDate() + 1 - offset * 30);

  const { runs, snapshots } = await loadCtrRunsWithSnapshots(
    business.id,
    toSqlDateTime(windowStart),
    toSqlDateTime(windowEnd)
  );
  const totalSessions = runs.length;

  const snapshotByRun = new Map();
  snapshots.forEach((snapshot) => {
    const list = snapshotByRun.get(snapshot.runId) ?? [];
    list.push(snapshot);
    snapshotByRun.set(snapshot.runId, list);
  });

  const groups = new Map();
  const windowDays = Array.from({ length: 30 }, (_, index) => {
    const day = new Date(windowStart);
    day.setUTCDate(windowStart.getUTCDate() + index);
    return day;
  });

  runs.forEach((row) => {
    const keywordLabel = normalizeKeywordLabel(row.keyword);
    const keywordKey = keywordLabel.toLowerCase();
    const allSnapshots = snapshotByRun.get(row.runId) ?? [];
    const keywordSnapshots = allSnapshots.filter((snap) => {
      const snapshotLabel = normalizeKeywordLabel(snap.keyword);
      return snapshotLabel.toLowerCase() === keywordKey;
    });
    const runSnapshots = keywordSnapshots.length ? keywordSnapshots : allSnapshots;

    const runPointsRaw = runSnapshots.map((snap) => ({
      ...snap,
      runId: row.runId,
      keyword: keywordLabel,
      runDate: row.runDate ?? null,
      startedAt: row.startedAt ?? null,
      finishedAt: row.finishedAt ?? null
    }));

    const rankedSnapshots = runPointsRaw.filter((snap) => {
      const rankValue = snap.matchedPosition === null || snap.matchedPosition === undefined
        ? snap.rankPosition
        : snap.matchedPosition;

      if (rankValue === null || rankValue === undefined) {
        return false;
      }

      const numericRank = Number(rankValue);
      return Number.isFinite(numericRank) && numericRank > 0;
    });

    const stats = rankedSnapshots.reduce((acc, snap) => {
      const rankValue = Number(snap.matchedPosition ?? snap.rankPosition);

      if (Number.isFinite(rankValue)) {
        acc.ranked += 1;
        if (rankValue <= 3) {
          acc.top3 += 1;
        }
        acc.sum += Math.min(rankValue, 20);
      }

      return acc;
    }, { ranked: 0, top3: 0, sum: 0 });

    const rankedCount = stats.ranked;
    const top3Count = stats.top3;
    const avgPositionValue = rankedCount > 0 ? stats.sum / rankedCount : null;
    const avgPosition = avgPositionValue === null ? null : formatDecimal(avgPositionValue, 2);
    const solvValue = rankedCount > 0 ? (top3Count * 100) / rankedCount : null;
    const solvTop3 = solvValue === null ? null : formatDecimal(solvValue, 1);
    const points = dedupePoints(rankedSnapshots);
    const runCenter = computeCenter(points);
    const runDateValue = row.runDate ? new Date(row.runDate) : null;
    const runDateKey = runDateValue ? runDateValue.toISOString().slice(0, 10) : null;

    const entry = groups.get(keywordLabel) ?? {
      keyword: keywordLabel,
      runs: [],
      daily: new Map()
    };

    entry.runs.push({
      runId: row.runId,
      startedAt: formatDate(row.startedAt),
      finishedAt: formatDate(row.finishedAt),
      runDateLabel: runDateValue ? formatDayLabel(runDateValue) : 'N/A',
      runDateValue,
      avgPosition,
      avgPositionValue,
      solvTop3,
      solvTop3Value: solvValue,
      rankedCount,
      top3Count,
      points,
      center: runCenter
    });

    const hasRankedPoints = rankedSnapshots.length > 0;

    if (runDateKey && hasRankedPoints) {
      const dailyMetrics = entry.daily.get(runDateKey) ?? {
        avgSum: 0,
        avgCount: 0,
        top3Sum: 0,
        rankedSum: 0
      };

      if (avgPositionValue !== null && Number.isFinite(avgPositionValue)) {
        dailyMetrics.avgSum += avgPositionValue;
        dailyMetrics.avgCount += 1;
      }

      dailyMetrics.top3Sum += top3Count;
      dailyMetrics.rankedSum += rankedCount;

      entry.daily.set(runDateKey, dailyMetrics);
    }

    groups.set(keywordLabel, entry);
  });

  const keywordSummaries = Array.from(groups.values()).map((entry) => {
    entry.runs.sort((a, b) => {
      const aTime = a.runDateValue ? a.runDateValue.getTime() : 0;
      const bTime = b.runDateValue ? b.runDateValue.getTime() : 0;
      return bTime - aTime;
    });

    const chartData = windowDays.map((day) => {
      const key = day.toISOString().slice(0, 10);
      const bucket = entry.daily.get(key);
      const avgPositionValue = bucket && bucket.avgCount > 0
        ? bucket.avgSum / bucket.avgCount
        : null;
      const solvTop3Value = bucket && bucket.rankedSum > 0
        ? (bucket.top3Sum * 100) / bucket.rankedSum
        : null;

      return {
        label: formatDayLabel(day),
        avgPositionValue,
        solvTop3Value
      };
    });

    const keywordPoints = entry.runs.flatMap((run) => run.points ?? []);
    const dedupedPoints = dedupePoints(keywordPoints);
    const keywordCenter = computeCenter(dedupedPoints) ?? computeCenter(keywordPoints) ?? { lat: 0, lng: 0 };

    return {
      keyword: entry.keyword,
      runs: entry.runs,
      chartData,
      mapPoints: dedupedPoints,
      center: keywordCenter
    };
  });

  keywordSummaries.sort((a, b) => a.keyword.localeCompare(b.keyword));

  const rangeLabel = formatRangeLabel(windowStart, windowEnd);
  const prevHref = `${baseHref}?offset=${offset + 1}`;
  const nextHref = offset > 0 ? `${baseHref}?offset=${offset - 1}` : null;
  const organizationBusinesses = await loadOrganizationBusinesses(session.organizationId);

  const businessOptions = organizationBusinesses.map((entry) => ({
    id: entry.id,
    value: entry.businessSlug ?? String(entry.id),
    label: entry.businessName || `Business #${entry.id}`,
    isActive: entry.isActive
  }));

  const businessIdentifier = business.businessSlug ?? String(business.id);
  const currentBusinessOptionValue = businessIdentifier;
  const showBusinessSwitcher = businessOptions.length > 0;
  const destination = business.destinationAddress
    ? `${business.destinationAddress}${business.destinationZip ? `, ${business.destinationZip}` : ''}`
    : null;
  const locationLabel = destination ?? null;
  const businessName = business.businessName || business.brandSearch || 'Business';

  return (
    <div className="dashboard-layout">
      <header className="dashboard-layout__header">
        <div className="dashboard-layout__header-container">
          <div className="dashboard-header">
            <div className="dashboard-header__content">
              <h1 className="page-title">CTR sessions</h1>
              <p className="page-subtitle">
                Window: <strong>{rangeLabel}</strong>
              </p>
              {locationLabel ? <span className="dashboard-sidebar__location">{locationLabel}</span> : null}
            </div>
          </div>

          <div className="dashboard-header__actions" aria-label="Page actions">
            {canManageSettings ? (
              <BusinessSettingsShortcut businessIdentifier={businessIdentifier} />
            ) : null}
            <div className={styles.headerRight}>
              <span className={styles.sessionCount}>
                {totalSessions} session{totalSessions === 1 ? '' : 's'} tracked
              </span>
              <div className={styles.navButtons}>
                <Link href={prevHref}>Previous 30 days</Link>
                {nextHref ? (
                  <Link href={nextHref}>Next 30 days</Link>
                ) : (
                  <span className={styles.navDisabled}>Next 30 days</span>
                )}
              </div>
            </div>
            {showBusinessSwitcher ? (
              <BusinessSwitcher businesses={businessOptions} currentValue={currentBusinessOptionValue} />
            ) : null}
          </div>
        </div>
      </header>

      <div className="dashboard-layout__body">
        <aside className="dashboard-layout__sidebar" aria-label="Workspace navigation">
          <div className="dashboard-sidebar__menu">
            <BusinessNavigation businessIdentifier={businessIdentifier} active={null} />
          </div>
        </aside>

        <main className="dashboard-layout__main">
          <div className="dashboard-layout__content">
            <div className={styles.ctrDashboard}>
              <div className={styles.header}>
                <span className={styles.range}>
                  Current window: <strong>{rangeLabel}</strong>
                </span>
              </div>

              {keywordSummaries.length === 0 ? (
                <p>No CTR runs recorded during this window.</p>
              ) : (
                keywordSummaries.map((summary) => (
                  <section key={summary.keyword} className={styles.keywordSection}>
                    <div className={styles.keywordHeader}>
                      <h2>{summary.keyword}</h2>
                      <p>
                        {summary.runs.length} session{summary.runs.length === 1 ? '' : 's'} tracked
                      </p>
                    </div>

                    <div className={styles.keywordGrid}>
                      <TrendChart data={summary.chartData} title={`${summary.keyword} trend`} />
                      {summary.mapPoints.length === 0 ? (
                        <div className={styles.mapPlaceholder}>
                          <p>No location data captured.</p>
                        </div>
                      ) : (
                        <CtrMap
                          apiKey={mapsApiKey}
                          center={summary.center}
                          points={summary.mapPoints}
                          businessName={businessName}
                        />
                      )}
                    </div>

                    <SessionList runs={summary.runs} />
                  </section>
                ))
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
