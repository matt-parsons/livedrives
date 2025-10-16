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
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
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
  return {
    runAt,
    businessId: entry.businessId ?? entry.companyId ?? null,
    driveIndex: entry.driveIndex ?? null,
    configPath: entry.configPath ?? null,
    metadata: entry.metadata ?? null
  };
}

export async function GET(request) {
  const session = await requireAuth(request);

  if (session.role !== 'owner') {
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
