const { DateTime } = require('luxon');
const { getZone, windowsForDay } = require('../business/businessHours');

const DEFAULT_TARGET_HOUR = 15;
const DEFAULT_TARGET_MINUTE = 0;
const MIN_LEAD_MINUTES = 120;
const DEFAULT_BUFFER_MINUTES = 5;
const DEFAULT_SEARCH_DAYS = 14;

function fromLuxonWeekday(weekday) {
  return weekday % 7;
}

function toLuxonWeekday(day) {
  return day === 0 ? 7 : day;
}

function parseTimeString(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const match = value.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) {
    return null;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return null;
  }

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }

  return { hour, minute };
}

function formatTimeString(hour, minute) {
  const h = String(Math.max(0, Math.min(23, Number(hour) || 0))).padStart(2, '0');
  const m = String(Math.max(0, Math.min(59, Number(minute) || 0))).padStart(2, '0');
  return `${h}:${m}:00`;
}

function clampWithinWindow(start, end, target, minLeadMinutes) {
  const latestStart = end.minus({ minutes: minLeadMinutes });
  if (latestStart <= start) {
    return null;
  }

  let candidate = target;
  if (candidate < start) {
    candidate = start;
  }
  if (candidate > latestStart) {
    candidate = latestStart;
  }

  if (candidate < start || candidate > latestStart) {
    return null;
  }

  return candidate;
}

function findNextSlot(config, options = {}) {
  const zone = getZone(config);
  const reference = (options.reference || DateTime.now()).setZone(zone);
  const minLeadMinutes = options.minLeadMinutes ?? MIN_LEAD_MINUTES;
  const targetHour = options.targetHour ?? DEFAULT_TARGET_HOUR;
  const targetMinute = options.targetMinute ?? DEFAULT_TARGET_MINUTE;
  const searchDays = options.searchDays ?? DEFAULT_SEARCH_DAYS;
  const bufferMinutes = options.bufferMinutes ?? DEFAULT_BUFFER_MINUTES;

  for (let offset = 0; offset <= searchDays; offset += 1) {
    const day = reference.plus({ days: offset });
    const windows = windowsForDay(config, day);

    if (!windows.length) {
      continue;
    }

    for (const window of windows) {
      const target = day.set({
        hour: targetHour,
        minute: targetMinute,
        second: 0,
        millisecond: 0
      });

      let candidate = clampWithinWindow(window.start, window.end, target, minLeadMinutes);
      if (!candidate) {
        continue;
      }

      if (offset === 0) {
        const earliest = reference.plus({ minutes: bufferMinutes });
        if (candidate <= earliest) {
          candidate = clampWithinWindow(window.start, window.end, earliest, minLeadMinutes);
          if (!candidate) {
            continue;
          }
        }
      }

      if (candidate > reference) {
        return candidate;
      }
    }
  }

  return null;
}

function validateSlotForDay(config, dayOfWeek, hour, minute, options = {}) {
  const zone = getZone(config);
  const reference = (options.reference || DateTime.now()).setZone(zone);
  const minLeadMinutes = options.minLeadMinutes ?? MIN_LEAD_MINUTES;
  const luxonWeekday = toLuxonWeekday(dayOfWeek);
  const sampleDay = reference.set({ weekday: luxonWeekday }).startOf('day');
  const windows = windowsForDay(config, sampleDay);

  if (!windows.length) {
    return false;
  }

  const target = sampleDay.set({ hour, minute, second: 0, millisecond: 0 });

  for (const window of windows) {
    const candidate = clampWithinWindow(window.start, window.end, target, minLeadMinutes);
    if (!candidate) {
      continue;
    }

    if (candidate.equals(target)) {
      return true;
    }
  }

  return false;
}

function nextOccurrenceForSchedule(config, schedule, options = {}) {
  if (!schedule) {
    return null;
  }

  const zone = getZone(config);
  const reference = (options.reference || DateTime.now()).setZone(zone);
  const minLeadMinutes = options.minLeadMinutes ?? schedule.minLeadMinutes ?? MIN_LEAD_MINUTES;
  const bufferMinutes = options.bufferMinutes ?? DEFAULT_BUFFER_MINUTES;

  const refDay = fromLuxonWeekday(reference.weekday);
  let delta = (schedule.dayOfWeek - refDay + 7) % 7;
  let day = reference.plus({ days: delta }).startOf('day');

  let candidate = day.set({
    hour: schedule.hour,
    minute: schedule.minute,
    second: 0,
    millisecond: 0
  });

  if (candidate <= reference.plus({ minutes: bufferMinutes })) {
    delta += 7;
    day = reference.plus({ days: delta }).startOf('day');
    candidate = day.set({
      hour: schedule.hour,
      minute: schedule.minute,
      second: 0,
      millisecond: 0
    });
  }

  const windows = windowsForDay(config, day);
  if (!windows.length) {
    return null;
  }

  for (const window of windows) {
    const clamped = clampWithinWindow(window.start, window.end, candidate, minLeadMinutes);
    if (!clamped) {
      continue;
    }

    if (clamped > reference) {
      return clamped;
    }
  }

  return null;
}

function scheduleFromDateTime(dateTime) {
  if (!dateTime) {
    return null;
  }

  return {
    dayOfWeek: fromLuxonWeekday(dateTime.weekday),
    hour: dateTime.hour,
    minute: dateTime.minute
  };
}

module.exports = {
  DEFAULT_BUFFER_MINUTES,
  DEFAULT_SEARCH_DAYS,
  DEFAULT_TARGET_HOUR,
  DEFAULT_TARGET_MINUTE,
  MIN_LEAD_MINUTES,
  clampWithinWindow,
  findNextSlot,
  formatTimeString,
  fromLuxonWeekday,
  nextOccurrenceForSchedule,
  parseTimeString,
  scheduleFromDateTime,
  toLuxonWeekday,
  validateSlotForDay
};

module.exports.default = module.exports;
