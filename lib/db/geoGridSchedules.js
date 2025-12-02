const { DateTime } = require('luxon');
const pool = require('./db');
const {
  DEFAULT_TARGET_HOUR,
  DEFAULT_TARGET_MINUTE,
  MIN_LEAD_MINUTES,
  findNextSlot,
  formatTimeString,
  nextOccurrenceForSchedule,
  parseTimeString,
  scheduleFromDateTime,
  validateSlotForDay
} = require('../utils/geoGridSchedule');
const geoGridKeywords = require('../business/geoGridKeywords');

function ensureConnection(conn) {
  if (conn) {
    return { connection: conn, release: false };
  }

  return {
    release: true,
    connection: pool.getConnection()
  };
}

function normalizeSegments(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value
      .map((segment) => (typeof segment === 'string' ? segment.trim() : String(segment || '').trim()))
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }

  return [];
}

function parseWindowsJson(raw) {
  if (!raw) {
    return {};
  }

  let parsed = {};
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return {};
  }

  if (!parsed || typeof parsed !== 'object') {
    return {};
  }

  return Object.entries(parsed).reduce((acc, [key, value]) => {
    acc[key] = normalizeSegments(value);
    return acc;
  }, {});
}

function buildScheduleConfig(business, hours) {
  return {
    timezone: business?.timezone || 'UTC',
    business_hours: hours || {}
  };
}

async function loadScheduleKeywords(businessId, conn = null) {
  const { connection: pendingConnection, release } = ensureConnection(conn);
  const connection = await pendingConnection;

  try {
    const [rows] = await connection.query(
      `SELECT keyword
         FROM geo_grid_schedule_keywords
        WHERE business_id = ?
        ORDER BY keyword ASC`,
      [businessId]
    );

    return rows.map((row) => row.keyword).filter(Boolean);
  } finally {
    if (release) {
      connection.release();
    }
  }
}

async function replaceScheduleKeywords(businessId, keywords, options = {}) {
  const normalized = geoGridKeywords.normalizeKeywordSelections(keywords);
  const { connection: pendingConnection, release } = ensureConnection(options.connection || null);
  const connection = await pendingConnection;

  const manageTransaction = options.transaction !== false;

  try {
    if (manageTransaction) {
      await connection.beginTransaction();
    }

    await connection.query('DELETE FROM geo_grid_schedule_keywords WHERE business_id = ?', [businessId]);

    if (normalized.length) {
      const values = normalized.map((keyword) => [businessId, keyword]);

      await connection.query(
        'INSERT INTO geo_grid_schedule_keywords (business_id, keyword, created_at) VALUES ?',
        [values]
      );
    }

    if (manageTransaction) {
      await connection.commit();
    }

    return normalized;
  } catch (error) {
    if (manageTransaction) {
      await connection.rollback();
    }
    throw error;
  } finally {
    if (release) {
      connection.release();
    }
  }
}

async function loadAvailableKeywords(businessId, conn = null) {
  const { connection: pendingConnection, release } = ensureConnection(conn);
  const connection = await pendingConnection;

  try {
    const [rows] = await connection.query(
      `SELECT keywords, weight
         FROM origin_zones
        WHERE business_id = ?`,
      [businessId]
    );

    return geoGridKeywords.collectAvailableKeywordsFromZones(rows);
  } finally {
    if (release) {
      connection.release();
    }
  }
}

function mapScheduleRow(row) {
  if (!row || row.runDayOfWeek === null || row.runDayOfWeek === undefined) {
    return null;
  }

  const time = parseTimeString(typeof row.runTimeLocal === 'string' ? row.runTimeLocal : '');
  const leadMinutes = Number(row.leadMinutes);

  return {
    dayOfWeek: Number(row.runDayOfWeek),
    hour: time ? time.hour : DEFAULT_TARGET_HOUR,
    minute: time ? time.minute : DEFAULT_TARGET_MINUTE,
    minLeadMinutes: Number.isFinite(leadMinutes) && leadMinutes > 0 ? leadMinutes : MIN_LEAD_MINUTES,
    nextRunAt: row.nextRunAt ? DateTime.fromJSDate(row.nextRunAt) : null,
    lastRunAt: row.lastRunAt ? DateTime.fromJSDate(row.lastRunAt) : null,
    lockedAt: row.lockedAt ? DateTime.fromJSDate(row.lockedAt) : null,
    isActive: row.scheduleIsActive === 1
  };
}

async function loadScheduleContext(businessId, conn = null) {
  const { connection: pendingConnection, release } = ensureConnection(conn);
  const connection = await pendingConnection;

  try {
    const [rows] = await connection.query(
      `SELECT b.id,
              b.organization_id   AS organizationId,
              b.business_name     AS businessName,
              b.timezone,
              b.is_active         AS businessIsActive,
              h.windows_json      AS windowsJson,
              s.run_day_of_week   AS runDayOfWeek,
              s.run_time_local    AS runTimeLocal,
              s.lead_minutes      AS leadMinutes,
              s.next_run_at       AS nextRunAt,
              s.last_run_at       AS lastRunAt,
              s.locked_at         AS lockedAt,
              s.is_active         AS scheduleIsActive
         FROM businesses b
         LEFT JOIN business_hours h
           ON h.business_id = b.id
         LEFT JOIN geo_grid_schedules s
           ON s.business_id = b.id
        WHERE b.id = ?
        LIMIT 1`,
      [businessId]
    );

    if (!rows.length) {
      return null;
    }

    const row = rows[0];
    const business = {
      id: row.id,
      organizationId: row.organizationId,
      businessName: row.businessName,
      timezone: row.timezone || 'UTC',
      isActive: row.businessIsActive === 1
    };

    const businessHours = parseWindowsJson(row.windowsJson);
    const schedule = mapScheduleRow(row);
    const selectedKeywords = await loadScheduleKeywords(businessId, connection);

    return { business, businessHours, schedule, selectedKeywords };
  } finally {
    if (release) {
      connection.release();
    }
  }
}

async function initializeGeoGridSchedule(businessId, options = {}) {
  const { connection: pendingConnection, release } = ensureConnection(options.connection || null);
  const connection = await pendingConnection;

  try {
    const context = await loadScheduleContext(businessId, connection);
    if (!context) {
      return null;
    }

    if (context.schedule) {
      return context.schedule;
    }

    const config = buildScheduleConfig(context.business, context.businessHours);
    const reference = options.reference || DateTime.now();
    let nextSlot = findNextSlot(config, {
      reference,
      minLeadMinutes: MIN_LEAD_MINUTES
    });

    if (!nextSlot) {
      nextSlot = reference
        .setZone(config.timezone)
        .plus({ days: 1 })
        .set({ hour: DEFAULT_TARGET_HOUR, minute: DEFAULT_TARGET_MINUTE, second: 0, millisecond: 0 });
    }

    const scheduleInfo = scheduleFromDateTime(nextSlot);
    const nextRunUtc = context.business.isActive
      ? nextSlot.toUTC().toISO({ suppressMilliseconds: true, includeOffset: false })
      : null;

    await connection.query(
      `INSERT INTO geo_grid_schedules (
         business_id,
         run_day_of_week,
         run_time_local,
         lead_minutes,
         next_run_at,
         last_run_at,
         locked_at,
         is_active,
         created_at,
         updated_at
       ) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())
       ON DUPLICATE KEY UPDATE
         run_day_of_week = VALUES(run_day_of_week),
         run_time_local = VALUES(run_time_local),
         lead_minutes = VALUES(lead_minutes),
         next_run_at = VALUES(next_run_at),
         is_active = VALUES(is_active),
         updated_at = UTC_TIMESTAMP()`,
      [
        businessId,
        scheduleInfo.dayOfWeek,
        formatTimeString(scheduleInfo.hour, scheduleInfo.minute),
        MIN_LEAD_MINUTES,
        nextRunUtc,
        context.business.isActive ? 1 : 0
      ]
    );

    return mapScheduleRow({
      runDayOfWeek: scheduleInfo.dayOfWeek,
      runTimeLocal: formatTimeString(scheduleInfo.hour, scheduleInfo.minute),
      leadMinutes: MIN_LEAD_MINUTES,
      nextRunAt: nextRunUtc ? new Date(`${nextRunUtc}Z`) : null,
      lastRunAt: null,
      lockedAt: null,
      scheduleIsActive: context.business.isActive ? 1 : 0
    });
  } finally {
    if (release) {
      connection.release();
    }
  }
}

async function updateScheduleStartTime(businessId, { hour, minute }, options = {}) {
  const { connection: pendingConnection, release } = ensureConnection(options.connection || null);
  const connection = await pendingConnection;

  try {
    let context = await loadScheduleContext(businessId, connection);
    if (!context) {
      return null;
    }

    if (!context.schedule) {
      await initializeGeoGridSchedule(businessId, { connection });
      context = await loadScheduleContext(businessId, connection);
    }

    if (!context.schedule) {
      return null;
    }

    const config = buildScheduleConfig(context.business, context.businessHours);
    const minLead = context.schedule.minLeadMinutes;

    if (!validateSlotForDay(config, context.schedule.dayOfWeek, hour, minute, { minLeadMinutes: minLead })) {
      const error = new Error('Requested time does not fall within business hours with sufficient lead time.');
      error.code = 'INVALID_TIME';
      throw error;
    }

    const reference = options.reference || DateTime.now();
    const nextSlot = nextOccurrenceForSchedule(
      config,
      {
        dayOfWeek: context.schedule.dayOfWeek,
        hour,
        minute,
        minLeadMinutes: minLead
      },
      { reference }
    );

    if (!nextSlot) {
      const error = new Error('Unable to compute next occurrence for the requested time.');
      error.code = 'NO_SLOT';
      throw error;
    }

    const nextRunUtc = context.business.isActive && context.schedule.isActive
      ? nextSlot.toUTC().toISO({ suppressMilliseconds: true, includeOffset: false })
      : null;

    await connection.query(
      `UPDATE geo_grid_schedules
          SET run_time_local = ?,
              next_run_at = ?,
              updated_at = UTC_TIMESTAMP()
        WHERE business_id = ?`,
      [formatTimeString(hour, minute), nextRunUtc, businessId]
    );

    return {
      ...context.schedule,
      hour,
      minute,
      nextRunAt: nextSlot,
      lastRunAt: context.schedule.lastRunAt
    };
  } finally {
    if (release) {
      connection.release();
    }
  }
}

async function setScheduleActiveState(businessId, isActive, options = {}) {
  const { connection: pendingConnection, release } = ensureConnection(options.connection || null);
  const connection = await pendingConnection;

  try {
    let context = await loadScheduleContext(businessId, connection);
    if (!context) {
      return null;
    }

    if (!context.schedule) {
      await initializeGeoGridSchedule(businessId, { connection });
      context = await loadScheduleContext(businessId, connection);
    }

    if (!context.schedule) {
      return null;
    }

    if (!isActive) {
      await connection.query(
        `UPDATE geo_grid_schedules
            SET is_active = 0,
                next_run_at = NULL,
                locked_at = NULL,
                updated_at = UTC_TIMESTAMP()
          WHERE business_id = ?`,
        [businessId]
      );

      return { ...context.schedule, isActive: false, nextRunAt: null };
    }

    const config = buildScheduleConfig(context.business, context.businessHours);
    const reference = options.reference || DateTime.now();
    let nextSlot = nextOccurrenceForSchedule(config, context.schedule, { reference });

    if (!nextSlot) {
      nextSlot = findNextSlot(config, { reference, minLeadMinutes: context.schedule.minLeadMinutes });
      if (!nextSlot) {
        const fallback = reference
          .setZone(config.timezone)
          .plus({ days: 1 })
          .set({ hour: DEFAULT_TARGET_HOUR, minute: DEFAULT_TARGET_MINUTE, second: 0, millisecond: 0 });
        nextSlot = fallback;
      }

      const updatedSchedule = scheduleFromDateTime(nextSlot);
      context.schedule.dayOfWeek = updatedSchedule.dayOfWeek;
      context.schedule.hour = updatedSchedule.hour;
      context.schedule.minute = updatedSchedule.minute;
    }

    const nextRunUtc = nextSlot.toUTC().toISO({ suppressMilliseconds: true, includeOffset: false });

    await connection.query(
      `UPDATE geo_grid_schedules
          SET is_active = 1,
              run_day_of_week = ?,
              run_time_local = ?,
              next_run_at = ?,
              locked_at = NULL,
              updated_at = UTC_TIMESTAMP()
        WHERE business_id = ?`,
      [
        context.schedule.dayOfWeek,
        formatTimeString(context.schedule.hour, context.schedule.minute),
        nextRunUtc,
        businessId
      ]
    );

    return { ...context.schedule, isActive: true, nextRunAt: nextSlot };
  } finally {
    if (release) {
      connection.release();
    }
  }
}

async function markScheduleRunComplete(businessId, executedAt, options = {}) {
  const { connection: pendingConnection, release } = ensureConnection(options.connection || null);
  const connection = await pendingConnection;

  try {
    const context = await loadScheduleContext(businessId, connection);
    if (!context || !context.schedule) {
      return null;
    }

    const executed = executedAt
      ? executedAt.setZone(context.business.timezone)
      : DateTime.now().setZone(context.business.timezone);

    if (!context.schedule.isActive || !context.business.isActive) {
      await connection.query(
        `UPDATE geo_grid_schedules
            SET last_run_at = ?,
                locked_at = NULL,
                updated_at = UTC_TIMESTAMP()
          WHERE business_id = ?`,
        [executed.toUTC().toISO({ suppressMilliseconds: true, includeOffset: false }), businessId]
      );
      return { ...context.schedule, lastRunAt: executed, nextRunAt: null };
    }

    const config = buildScheduleConfig(context.business, context.businessHours);
    let nextSlot = nextOccurrenceForSchedule(config, context.schedule, { reference: executed });

    if (!nextSlot) {
      nextSlot = findNextSlot(config, { reference: executed, minLeadMinutes: context.schedule.minLeadMinutes });
      if (nextSlot) {
        const updatedSchedule = scheduleFromDateTime(nextSlot);
        context.schedule.dayOfWeek = updatedSchedule.dayOfWeek;
        context.schedule.hour = updatedSchedule.hour;
        context.schedule.minute = updatedSchedule.minute;
      }
    }

    const nextRunUtc = nextSlot
      ? nextSlot.toUTC().toISO({ suppressMilliseconds: true, includeOffset: false })
      : null;

    await connection.query(
      `UPDATE geo_grid_schedules
          SET last_run_at = ?,
              next_run_at = ?,
              run_day_of_week = ?,
              run_time_local = ?,
              locked_at = NULL,
              updated_at = UTC_TIMESTAMP()
        WHERE business_id = ?`,
      [
        executed.toUTC().toISO({ suppressMilliseconds: true, includeOffset: false }),
        nextRunUtc,
        context.schedule.dayOfWeek,
        formatTimeString(context.schedule.hour, context.schedule.minute),
        businessId
      ]
    );

    return {
      ...context.schedule,
      lastRunAt: executed,
      nextRunAt: nextSlot || null
    };
  } finally {
    if (release) {
      connection.release();
    }
  }
}

async function releaseScheduleLock(businessId, options = {}) {
  const { connection: pendingConnection, release } = ensureConnection(options.connection || null);
  const connection = await pendingConnection;

  try {
    await connection.query(
      `UPDATE geo_grid_schedules
          SET locked_at = NULL,
              updated_at = UTC_TIMESTAMP()
        WHERE business_id = ?`,
      [businessId]
    );
  } finally {
    if (release) {
      connection.release();
    }
  }
}

module.exports = {
  buildScheduleConfig,
  loadAvailableKeywords,
  initializeGeoGridSchedule,
  loadScheduleKeywords,
  loadScheduleContext,
  markScheduleRunComplete,
  replaceScheduleKeywords,
  releaseScheduleLock,
  setScheduleActiveState,
  updateScheduleStartTime
};

module.exports.default = module.exports;
