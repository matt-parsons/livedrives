// lib/businessHours.js
const { DateTime } = require('luxon');

function getZone(config) {
  return config.timezone || process.env.TZ || 'UTC';
}
function dayKey(dt) {
  return ['mon','tue','wed','thu','fri','sat','sun'][dt.weekday - 1];
}
function rangesForDay(bh, dt) {
  let spec = bh?.[dayKey(dt)] ?? [];
  if (typeof spec === 'string') spec = [spec];
  return spec.map(s => s.trim()).filter(Boolean);
}
function parseRange(range) {
  const r = String(range).toLowerCase();
  if (r === 'closed' || r === 'none') return null;
  if (r === '24h' || r === '24hr' || r === '24hrs') return { start: 0, end: 1440, wraps: false };

  const [start, end] = range.split('-').map(p => p.trim());
  const toMin = (t) => {
    const [h, m='0'] = t.split(':');
    const H = parseInt(h, 10);
    const M = parseInt(m, 10) || 0;
    return H * 60 + M;
  };
  let s = toMin(start);
  let e = end === '24:00' ? 1440 : toMin(end);
  if (isNaN(s) || isNaN(e) || s === e) return null;
  return { start: s, end: e, wraps: e < s };
}
function minutesSinceMidnight(dt) { return dt.hour * 60 + dt.minute; }

function isOpenNow(config, now = DateTime.now().setZone(getZone(config))) {
  const bh = config.business_hours || {};
  const n  = now.setZone(getZone(config));
  const today = rangesForDay(bh, n).map(parseRange).filter(Boolean);
  const nMin  = minutesSinceMidnight(n);

  for (const r of today) {
    if (!r.wraps && nMin >= r.start && nMin < r.end) return true;
    if (r.wraps && nMin >= r.start) return true; // evening part of wrap
  }
  // early-morning part from yesterday’s wrap
  const y = n.minus({ days: 1 });
  for (const r of rangesForDay(bh, y).map(parseRange).filter(Boolean)) {
    if (r.wraps && nMin < r.end) return true;
  }
  return false;
}

function nextOpenAt(config, now = DateTime.now().setZone(getZone(config))) {
  const n = now.setZone(getZone(config));
  const nMin = minutesSinceMidnight(n);
  const bh = config.business_hours || {};
  for (let d = 0; d < 7; d++) {
    const day = n.plus({ days: d });
    const ranges = rangesForDay(bh, day).map(parseRange).filter(Boolean);
    for (const r of ranges) {
      if (d > 0 || r.start > nMin) {
        return day.startOf('day').plus({ minutes: r.start });
      }
    }
  }
  return null;
}

/** All open windows that overlap *today* (calendar day in business TZ). */
function windowsToday(config, now = DateTime.now().setZone(getZone(config))) {
  const zone = getZone(config);
  const n = now.setZone(zone);
  const todayStart = n.startOf('day');
  const todayEnd   = todayStart.plus({ days: 1 });
  const bh = config.business_hours || {};
  const out = [];

  // Today's ranges
  for (const r of rangesForDay(bh, n).map(parseRange).filter(Boolean)) {
    if (!r.wraps) {
      out.push({ start: todayStart.plus({ minutes: r.start }), end: todayStart.plus({ minutes: r.end }) });
    } else {
      out.push({ start: todayStart.plus({ minutes: r.start }), end: todayEnd });
    }
  }
  // Yesterday's wrapped early-morning spillover
  const y = n.minus({ days: 1 });
  for (const r of rangesForDay(bh, y).map(parseRange).filter(Boolean)) {
    if (r.wraps) {
      out.push({ start: todayStart, end: todayStart.plus({ minutes: r.end }) });
    }
  }

  // Normalize & sort
  return out
    .map(w => ({ start: w.start < todayStart ? todayStart : w.start, end: w.end > todayEnd ? todayEnd : w.end }))
    .filter(w => w.end > w.start)
    .sort((a, b) => a.start - b.start);
}

function windowsForDay(config, day = DateTime.now().setZone(getZone(config))) {
  const zone = getZone(config);
  const d = day.setZone(zone).startOf('day');
  const nextDay = d.plus({ days: 1 });
  const bh = config.business_hours || {};
  const out = [];

  for (const r of rangesForDay(bh, d).map(parseRange).filter(Boolean)) {
    if (!r.wraps) {
      out.push({ start: d.plus({ minutes: r.start }), end: d.plus({ minutes: r.end }) });
    } else {
      out.push({ start: d.plus({ minutes: r.start }), end: nextDay });
    }
  }

  return out
    .map(w => ({ start: w.start < d ? d : w.start, end: w.end > nextDay ? nextDay : w.end }))
    .filter(w => w.end > w.start)
    .sort((a, b) => a.start - b.start);
}

module.exports = { getZone, isOpenNow, nextOpenAt, windowsToday, windowsForDay };
