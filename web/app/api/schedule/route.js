import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { requireAuth } from '@/lib/authServer';

const DEFAULT_SCHEDULE_PATH = process.env.SCHEDULE_LOG_PATH || '/opt/livedrive/logs/schedule-log.jsonl';
const DEFAULT_TIMEZONE = process.env.LOGS_TIMEZONE || 'America/Phoenix';

async function readScheduleEntries(filePath) {
  try {
    const contents = await fs.readFile(filePath, 'utf8');
    return contents
      .split(/\r?\n/g)
      .map((line) => line.replace(/^\[\]/, '').trim())
      .filter(Boolean)
      .map((line) => {
        try {
          const parsed = JSON.parse(line);
          return parsed && !Array.isArray(parsed) && typeof parsed === 'object' ? parsed : null;
        } catch (error) {
          return null;
        }
      })
      .filter(Boolean);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

function normalizeEntry(entry) {
  const runAt = entry.runAt || entry.run_at || entry.scheduled_for || null;
  const businessId = entry.businessId ?? entry.business_id ?? null;
  const companyId = entry.companyId ?? entry.company_id ?? null;
  const businessName =
    entry.businessName ??
    entry.business_name ??
    entry.companyName ??
    entry.company_name ??
    entry.company ??
    entry.companyId ??
    null;

  return {
    runAt,
    businessId,
    companyId,
    businessName,
    driveIndex: entry.driveIndex ?? entry.drive_index ?? null,
    configPath: entry.configPath ?? entry.config_path ?? null,
    metadata: entry.metadata ?? null,
    source: entry.source ?? null
  };
}

export async function GET(request) {
  const session = await requireAuth(request);

  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const timezone = searchParams.get('timezone') || DEFAULT_TIMEZONE;
  const fileParam = searchParams.get('path');
  const schedulePath = fileParam ? path.resolve(fileParam) : DEFAULT_SCHEDULE_PATH;

  const entries = (await readScheduleEntries(schedulePath)).map(normalizeEntry);

  return NextResponse.json({
    timezone,
    count: entries.length,
    entries
  });
}
