import pool from '@lib/db/db.js';
import geoGridSchedules from '@lib/db/geoGridSchedules.js';
import geoGridSchedule from '@lib/utils/geoGridSchedule.js';
import { AuthError, requireAuth } from '@/lib/authServer';
import { buildOrganizationScopeClause } from '@/lib/organizations';

const { parseTimeString } = geoGridSchedule;

function serializeSchedule(context) {
  if (!context || !context.schedule) {
    return null;
  }

  const { schedule, business } = context;

  const startHour = String(schedule.hour).padStart(2, '0');
  const startMinute = String(schedule.minute).padStart(2, '0');

  return {
    dayOfWeek: schedule.dayOfWeek,
    startTimeLocal: `${startHour}:${startMinute}`,
    leadMinutes: schedule.minLeadMinutes,
    nextRunAt: schedule.nextRunAt ? schedule.nextRunAt.toISO({ suppressMilliseconds: true }) : null,
    lastRunAt: schedule.lastRunAt ? schedule.lastRunAt.toISO({ suppressMilliseconds: true }) : null,
    isActive: schedule.isActive,
    timezone: business?.timezone || 'UTC'
  };
}

export async function PATCH(request, { params }) {
  const rawId = params?.businessId;
  const businessId = Number(rawId);

  if (!Number.isFinite(businessId) || businessId <= 0) {
    return Response.json({ error: 'Invalid business identifier.' }, { status: 400 });
  }

  let payload = {};
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const startTime = typeof payload.startTime === 'string' ? payload.startTime.trim() : '';
  const parsedTime = parseTimeString(startTime);

  if (!parsedTime) {
    return Response.json({ error: 'startTime must be provided in HH:MM 24-hour format.' }, { status: 400 });
  }

  try {
    const session = await requireAuth(request);

    if (session.role !== 'owner') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const scope = buildOrganizationScopeClause(session);
    const [businessRows] = await pool.query(
      `SELECT id
         FROM businesses
        WHERE id = ?
          AND ${scope.clause}
        LIMIT 1`,
      [businessId, ...scope.params]
    );

    if (!businessRows.length) {
      return Response.json({ error: 'Business not found.' }, { status: 404 });
    }

    try {
      await geoGridSchedules.updateScheduleStartTime(businessId, parsedTime);
    } catch (error) {
      if (error && error.code === 'INVALID_TIME') {
        return Response.json({ error: error.message }, { status: 400 });
      }

      if (error && error.code === 'NO_SLOT') {
        return Response.json({ error: 'Unable to compute the next weekly run for the requested time.' }, { status: 400 });
      }

      throw error;
    }

    const updatedContext = await geoGridSchedules.loadScheduleContext(businessId);
    const schedule = serializeSchedule(updatedContext);

    if (!schedule) {
      return Response.json({ error: 'Schedule not available for this business.' }, { status: 404 });
    }

    return Response.json({ schedule });
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }

    console.error(`Failed to update geo grid schedule for business ${rawId}`, error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
