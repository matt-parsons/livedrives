import { NextResponse } from 'next/server';
import pool from '@lib/db/db.js';
import taskCompletionModule from '@lib/db/gbpTaskCompletions.js';
import { AuthError, requireAuth } from '@/lib/authServer';
import { buildOrganizationScopeClause } from '@/lib/organizations';

const completionsApi = taskCompletionModule?.default ?? taskCompletionModule;
const { markTaskCompletion } = completionsApi;

export const runtime = 'nodejs';

function normalizeCompletionPayload(record) {
  if (!record) {
    return null;
  }

  return {
    businessId: record.businessId,
    taskId: record.taskId,
    status: record.status,
    markedBy: record.markedBy,
    markedAt: record.markedAt ? record.markedAt.toISOString() : null,
    resolvedAt: record.resolvedAt ? record.resolvedAt.toISOString() : null,
    notes: record.notes ?? null
  };
}

export async function POST(request) {
  if (typeof markTaskCompletion !== 'function') {
    return NextResponse.json({ error: 'Task completion support is unavailable.' }, { status: 503 });
  }

  let payload = {};
  try {
    payload = await request.json();
  } catch {
    payload = {};
  }

  const businessId = Number(payload?.businessId);
  const rawTaskId = typeof payload?.taskId === 'string' ? payload.taskId.trim() : '';

  if (!Number.isFinite(businessId) || businessId <= 0) {
    return NextResponse.json({ error: 'A valid business identifier is required.' }, { status: 400 });
  }

  if (!rawTaskId) {
    return NextResponse.json({ error: 'A task identifier is required.' }, { status: 400 });
  }

  let session;
  try {
    session = await requireAuth(request);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    throw error;
  }

  const scope = buildOrganizationScopeClause(session);
  const [rows] = await pool.query(
    `SELECT id
       FROM businesses
      WHERE id = ?
        AND ${scope.clause}
      LIMIT 1`,
    [businessId, ...scope.params]
  );

  if (!rows.length) {
    return NextResponse.json({ error: 'Business not found.' }, { status: 404 });
  }

  try {
    const completion = await markTaskCompletion({
      businessId,
      taskId: rawTaskId,
      userId: session.userId
    });

    return NextResponse.json({ completion: normalizeCompletionPayload(completion) });
  } catch (error) {
    console.error('Failed to record GBP task completion', error);
    return NextResponse.json(
      { error: 'Unable to mark this task complete right now. Try again shortly.' },
      { status: 500 }
    );
  }
}
