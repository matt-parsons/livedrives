import { NextResponse } from 'next/server';
import pool from '@lib/db.js';
import { requireAuth } from '@/lib/authServer';

const DEFAULT_TIMEZONE = process.env.LOGS_TIMEZONE || 'America/Phoenix';

function parseMaybeJson(value) {
  if (value == null) return null;
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed);
    } catch (error) {
      return value;
    }
  }
  return value;
}

function toIsoString(value) {
  if (!value) return null;
  try {
    if (value instanceof Date) {
      return value.toISOString();
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  } catch (error) {
    return null;
  }
}

function filterToToday(rows, timezone) {
  const tz = timezone || DEFAULT_TIMEZONE;
  const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());

  return rows.filter((row) => {
    const ts = row.timestamp_utc ?? row.created_at;
    if (!ts) return false;
    const key = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(ts));
    return key === todayKey;
  });
}

export async function GET(request) {
  const session = await requireAuth(request);

  if (session.role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const scopeParam = searchParams.get('scope');
  const scope = scopeParam === 'all' || scopeParam === 'today' ? scopeParam : 'today';
  const tz = searchParams.get('timezone') || DEFAULT_TIMEZONE;

  const whereClause = scope === 'today' ? 'WHERE COALESCE(rl.timestamp_utc, rl.created_at) >= UTC_DATE()' : '';
  const sql = `
    SELECT
      rl.id,
      rl.run_id,
      rl.timestamp_utc,
      rl.session_id,
      r.business_id,
      rl.keyword,
      rl.business_name,
      rl.reason,
      rl.ctr_ip_address,
      rl.drive_ip_address,
      rl.origin,
      rl.location_label,
      rl.device,
      rl.steps_json,
      rl.duration_min,
      rl.events_json,
      rl.created_at,
      rl.rank
    FROM run_logs rl
    LEFT JOIN runs r ON r.id = rl.run_id
    ${whereClause}
    ORDER BY COALESCE(rl.timestamp_utc, rl.created_at) DESC, rl.id DESC
  `;

  const [rows] = await pool.query(sql);

  let normalized = rows.map((row) => {
    const origin = parseMaybeJson(row.origin);
    const locationLabel = parseMaybeJson(row.location_label);
    const steps = parseMaybeJson(row.steps_json);
    const events = parseMaybeJson(row.events_json);

    return {
      id: row.id,
      run_id: row.run_id,
      timestamp_utc: toIsoString(row.timestamp_utc),
      session_id: row.session_id,
      business_id: row.business_id != null ? Number(row.business_id) : null,
      keyword: row.keyword ?? null,
      business_name: row.business_name ?? null,
      reason: row.reason ?? null,
      ctr_ip_address: row.ctr_ip_address ?? null,
      drive_ip_address: row.drive_ip_address ?? null,
      origin,
      location_label: locationLabel,
      device: row.device ?? null,
      steps,
      duration_min: row.duration_min != null ? Number(row.duration_min) : null,
      events,
      created_at: toIsoString(row.created_at),
      rank: row.rank != null ? Number(row.rank) : null
    };
  });

  if (scope === 'today') {
    normalized = filterToToday(normalized, tz);
  }

  return NextResponse.json({
    scope,
    timezone: tz,
    count: normalized.length,
    rows: normalized
  });
}
