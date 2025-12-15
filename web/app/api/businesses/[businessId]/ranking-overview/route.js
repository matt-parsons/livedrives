import { AuthError, requireAuth } from '@/lib/authServer';
import { loadBusiness, loadGeoGridRunSummaries } from '@/app/dashboard/[business]/helpers';

export const runtime = 'nodejs';

function toTimestamp(value) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function formatPercent(value, digits = 0) {
  if (value === null || value === undefined) return null;
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return null;
  return `${numericValue.toFixed(digits)}%`;
}

function formatNumber(value, digits = 0) {
  if (value === null || value === undefined) return null;
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return null;
  return numericValue.toFixed(digits);
}

function formatDateLabel(value) {
  if (!value) return null;

  try {
    return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(value));
  } catch {
    return String(value);
  }
}

function summarizeRankingRuns(rankingRuns, businessName = '') {
  const runs = Array.isArray(rankingRuns) ? rankingRuns.filter(Boolean) : [];

  if (!runs.length) {
    return `No ranking reports yet for ${businessName || 'this business'}. Once your first scan finishes, you’ll see a quick summary of coverage, average rank, and top-3 visibility here.`;
  }

  const sorted = runs
    .slice()
    .sort((a, b) => (toTimestamp(b.finishedAt ?? b.lastMeasuredAt ?? b.createdAt) ?? 0) - (toTimestamp(a.finishedAt ?? a.lastMeasuredAt ?? a.createdAt) ?? 0));
  const latest = sorted[0];

  const keyword = (latest?.keyword ?? '').toString().trim() || 'your tracked keyword';
  const totalRuns = runs.length;

  const totalPoints = Number(latest?.totalPoints ?? 0);
  const rankedPoints = Number(latest?.rankedPoints ?? 0);
  const top3Points = Number(latest?.top3Points ?? 0);
  const avgRankValue = latest?.avgRank === null || latest?.avgRank === undefined ? null : Number(latest.avgRank);

  const coverageValue = totalPoints > 0 ? (rankedPoints * 100) / totalPoints : null;
  const top3ShareValue = rankedPoints > 0 ? (top3Points * 100) / rankedPoints : null;

  const latestDate = formatDateLabel(latest?.finishedAt ?? latest?.lastMeasuredAt ?? latest?.createdAt);
  const coverageLabel = formatPercent(coverageValue, 0);
  const top3ShareLabel = formatPercent(top3ShareValue, 0);
  const avgRankLabel = formatNumber(avgRankValue, 1);

  const parts = [];
  parts.push(`${businessName ? `${businessName}: ` : ''}${totalRuns} ranking report${totalRuns === 1 ? '' : 's'} tracked.`);

  if (latestDate) {
    parts.push(`Latest scan (${keyword}) ran on ${latestDate}.`);
  } else {
    parts.push(`Latest scan keyword: ${keyword}.`);
  }

  const metricParts = [];
  if (coverageLabel) metricParts.push(`${coverageLabel} of grid points are ranking in the top 20`);
  if (avgRankLabel) metricParts.push(`avg rank ${avgRankLabel}`);
  if (top3ShareLabel) metricParts.push(`${top3ShareLabel} of ranked points are in the top 3`);
  if (metricParts.length) {
    parts.push(`${metricParts.join(', ')}.`);
  }

  if (coverageValue !== null && coverageValue < 50) {
    parts.push('Coverage is low; prioritize GBP relevance (services/categories), on-page keyword alignment, and review velocity to expand visibility.');
  } else if (avgRankValue !== null && avgRankValue > 10) {
    parts.push('Average rank is outside the top 10; focus on strengthening proximity signals, category fit, and landing page intent for this query.');
  } else if (top3ShareValue !== null && top3ShareValue < 25) {
    parts.push('You’re ranking, but not often in the top 3; targeted GBP updates and location-based content can help push more points into the top tier.');
  } else if (metricParts.length) {
    parts.push('Momentum looks solid; keep the same keyword and monitor weekly so you can catch shifts early.');
  }

  return parts.join(' ');
}

export async function GET(request, { params }) {
  const businessIdParam = params?.businessId;
  const businessId = Number(businessIdParam);

  if (!Number.isFinite(businessId) || businessId <= 0) {
    return Response.json({ error: 'Invalid business identifier.' }, { status: 400 });
  }

  try {
    const session = await requireAuth(request);
    const business = await loadBusiness(session, businessIdParam);

    if (!business) {
      return Response.json({ error: 'Business not found.' }, { status: 404 });
    }

    const rankingData = await loadGeoGridRunSummaries(business.id);
    const overview = summarizeRankingRuns(rankingData, business.businessName || '');

    return Response.json({ overview });
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }

    console.error(`Failed to fetch ranking overview for business ${params?.businessId}`, error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
