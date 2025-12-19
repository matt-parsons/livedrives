import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import { requireAuth } from '@/lib/authServer';

const LOG_FILE_PATH = process.env.GEOSEARCH_LOG_PATH || '/var/log/geosearch.log';
const DEFAULT_LINE_LIMIT = 50;
const MIN_LINE_LIMIT = 50;
const MAX_LINE_LIMIT = 2000;

export async function GET(request) {
  const session = await requireAuth(request);

  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const rawLimit = Number.parseInt(searchParams.get('limit') ?? '', 10);
  let limit = Number.isFinite(rawLimit) ? rawLimit : DEFAULT_LINE_LIMIT;
  limit = Math.min(Math.max(limit, MIN_LINE_LIMIT), MAX_LINE_LIMIT);

  const path = LOG_FILE_PATH;

  let stats;

  try {
    stats = await fs.stat(path);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return NextResponse.json(
        {
          path,
          exists: false,
          limit,
          totalLines: 0,
          lines: [],
          truncated: false,
          startLineNumber: 0,
          lastModified: null,
          size: null,
          error: 'Log file not found.'
        },
        { status: 404 }
      );
    }

    throw error;
  }

  let rawContent;

  try {
    rawContent = await fs.readFile(path, 'utf8');
  } catch (error) {
    const status = error && error.code === 'EACCES' ? 403 : 500;
    return NextResponse.json(
      {
        path,
        exists: true,
        limit,
        totalLines: 0,
        lines: [],
        truncated: false,
        startLineNumber: 0,
        lastModified: stats?.mtime ? stats.mtime.toISOString() : null,
        size: stats?.size ?? null,
        error: 'Unable to read log file contents.'
      },
      { status }
    );
  }

  const lines = rawContent.split(/\r?\n/);

  if (lines.length && lines[lines.length - 1] === '') {
    lines.pop();
  }

  const totalLines = lines.length;
  const startIndex = Math.max(totalLines - limit, 0);
  const selectedLines = lines.slice(startIndex);
  const startLineNumber = totalLines === 0 ? 0 : startIndex + 1;

  return NextResponse.json({
    path,
    exists: true,
    limit,
    totalLines,
    lines: selectedLines,
    truncated: startIndex > 0,
    startLineNumber,
    lastModified: stats?.mtime ? stats.mtime.toISOString() : null,
    size: stats?.size ?? null
  });
}
