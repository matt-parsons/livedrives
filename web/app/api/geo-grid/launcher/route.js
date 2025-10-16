import pool from '@lib/db.js';
import { AuthError, requireAuth } from '@/lib/authServer';
import { GEO_GRID_PRESETS, GEO_RADIUS_PRESETS } from '@/lib/geoGrid';

const DEFAULT_TIMEZONE = process.env.LOGS_TIMEZONE || 'America/Phoenix';
const DEFAULT_OFFSET = process.env.LOGS_TIMEZONE_OFFSET || '-07:00';

export const runtime = 'nodejs';

function parseOriginZoneKeywords(raw) {
  if (raw === null || raw === undefined) {
    return [];
  }

  const str = String(raw).trim();
  if (!str) {
    return [];
  }

  const addKeyword = (set, value) => {
    if (!value && value !== 0) return;
    const term = String(value).trim();
    if (term) {
      set.add(term);
    }
  };

  const keywords = new Set();

  if (str.startsWith('[')) {
    try {
      const decoded = JSON.parse(str);

      if (Array.isArray(decoded)) {
        for (const entry of decoded) {
          if (!entry && entry !== 0) {
            continue;
          }

          if (typeof entry === 'string') {
            addKeyword(keywords, entry);
            continue;
          }

          if (typeof entry === 'object') {
            const candidate = entry.term ?? entry.keyword ?? entry.value ?? entry.name;
            addKeyword(keywords, candidate);
            continue;
          }
        }
      }

      if (keywords.size) {
        return Array.from(keywords);
      }
    } catch {
      // fall through to delimiter parsing below
    }
  }

  str
    .split(/[,;\n]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((term) => keywords.add(term));

  return Array.from(keywords);
}

function minutesToOffset(minutes) {
  if (!Number.isFinite(minutes)) {
    return DEFAULT_OFFSET;
  }

  const rounded = Math.round(minutes);
  const sign = rounded >= 0 ? '+' : '-';
  const absolute = Math.abs(rounded);
  const hours = String(Math.floor(absolute / 60)).padStart(2, '0');
  const mins = String(Math.abs(absolute % 60)).padStart(2, '0');
  return `${sign}${hours}:${mins}`;
}

function computeTimezoneOffset(timeZone) {
  if (process.env.LOGS_TIMEZONE_OFFSET && /^[+-]\d{2}:\d{2}$/.test(process.env.LOGS_TIMEZONE_OFFSET)) {
    return process.env.LOGS_TIMEZONE_OFFSET;
  }

  try {
    const now = new Date();
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    const parts = dtf.formatToParts(now).reduce((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});

    const asUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second)
    );
    const minutes = (asUtc - now.getTime()) / 60000;
    return minutesToOffset(minutes);
  } catch {
    return DEFAULT_OFFSET;
  }
}

function formatDateKey(date, timeZone) {
  try {
    const dtf = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const parts = dtf.formatToParts(date).reduce((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});

    if (parts.year && parts.month && parts.day) {
      return `${parts.year}-${parts.month}-${parts.day}`;
    }
  } catch {
    // fall through
  }

  return date.toISOString().slice(0, 10);
}

export async function GET(request) {
  try {
    const session = await requireAuth(request);

    if (session.role !== 'owner') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const [businessRows] = await pool.query(
      `SELECT id,
              business_name AS businessName,
              business_slug AS businessSlug
         FROM businesses
        WHERE organization_id = ?
        ORDER BY business_name ASC`,
      [session.organizationId]
    );

    const businesses = businessRows.map((row) => ({
      id: row.id,
      businessName: row.businessName,
      businessSlug: row.businessSlug
    }));

    if (businesses.length === 0) {
      return Response.json({
        timezone: DEFAULT_TIMEZONE,
        timezoneOffset: computeTimezoneOffset(DEFAULT_TIMEZONE),
        today: formatDateKey(new Date(), DEFAULT_TIMEZONE),
        gridPresets: GEO_GRID_PRESETS,
        radiusPresets: GEO_RADIUS_PRESETS,
        businesses: []
      });
    }

    const timezone = DEFAULT_TIMEZONE;
    const timezoneOffset = computeTimezoneOffset(timezone);
    const todayKey = formatDateKey(new Date(), timezone);

    const tsUtc = `CASE
        WHEN rl.timestamp_utc LIKE '%T%'
          THEN STR_TO_DATE(REPLACE(REPLACE(rl.timestamp_utc, 'T', ' '), 'Z', ''), '%Y-%m-%d %H:%i:%s.%f')
        ELSE rl.timestamp_utc
      END`;
    const dayExpr = `DATE(CONVERT_TZ(COALESCE(${tsUtc}, rl.created_at), '+00:00', ?))`;

    const [keywordRows] = await pool.query(
      `SELECT ${dayExpr} AS day,
              rl.business_id AS businessId,
              COALESCE(NULLIF(TRIM(rl.keyword), ''), '(none)') AS keyword,
              SUM(CASE WHEN rl.reason = 'success' THEN 1 ELSE 0 END) AS successCount
         FROM run_logs rl
         JOIN businesses b ON b.id = rl.business_id
        WHERE b.organization_id = ?
        GROUP BY day, businessId, keyword
        HAVING successCount > 0
        ORDER BY day DESC, successCount DESC`,
      [timezoneOffset, session.organizationId]
    );

    const totalsByBusiness = new Map();

    for (const row of keywordRows) {
      const businessId = Number(row.businessId);
      if (!Number.isFinite(businessId)) {
        continue;
      }

      const keyword = row.keyword || '(none)';
      const count = Number(row.successCount) || 0;
      if (count <= 0) {
        continue;
      }

      const day = row.day instanceof Date ? row.day.toISOString().slice(0, 10) : String(row.day || '');
      const entry = totalsByBusiness.get(businessId) || { all: new Map(), byDay: new Map() };
      entry.all.set(keyword, (entry.all.get(keyword) || 0) + count);

      if (day) {
        const dayMap = entry.byDay.get(day) || new Map();
        dayMap.set(keyword, (dayMap.get(keyword) || 0) + count);
        entry.byDay.set(day, dayMap);
      }

      totalsByBusiness.set(businessId, entry);
    }

    if (businesses.length) {
      const placeholders = businesses.map(() => '?').join(',');
      const [originRows] = await pool.query(
        `SELECT business_id AS businessId, keywords FROM origin_zones WHERE business_id IN (${placeholders})`,
        businesses.map((business) => business.id)
      );

      for (const row of originRows) {
        const businessId = Number(row.businessId);
        if (!Number.isFinite(businessId)) {
          continue;
        }

        const keywords = parseOriginZoneKeywords(row.keywords);
        if (!keywords.length) {
          continue;
        }

        const entry = totalsByBusiness.get(businessId) || { all: new Map(), byDay: new Map() };
        for (const keyword of keywords) {
          if (!entry.all.has(keyword)) {
            entry.all.set(keyword, 0);
          }
        }
        totalsByBusiness.set(businessId, entry);
      }
    }

    const payloadBusinesses = businesses.map((business) => {
      const entry = totalsByBusiness.get(business.id) || { all: new Map(), byDay: new Map() };
      const keywordsAll = Array.from(entry.all.entries())
        .sort((a, b) => {
          if (b[1] !== a[1]) {
            return b[1] - a[1];
          }
          return a[0].localeCompare(b[0]);
        })
        .map(([keyword, count]) => ({ keyword, count }));
      const todayMap = entry.byDay.get(todayKey) || new Map();
      const keywordsToday = Array.from(todayMap.entries())
        .sort((a, b) => {
          if (b[1] !== a[1]) {
            return b[1] - a[1];
          }
          return a[0].localeCompare(b[0]);
        })
        .map(([keyword, count]) => ({ keyword, count }));

      return {
        id: business.id,
        businessName: business.businessName,
        businessSlug: business.businessSlug,
        keywords: {
          today: keywordsToday,
          all: keywordsAll
        }
      };
    });

    return Response.json({
      timezone,
      timezoneOffset,
      today: todayKey,
      gridPresets: GEO_GRID_PRESETS,
      radiusPresets: GEO_RADIUS_PRESETS,
      businesses: payloadBusinesses
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }

    console.error('Failed to load geo grid launcher payload', error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
