'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatDateTime(isoString, timezone) {
  if (!isoString) {
    return null;
  }

  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: timezone || 'UTC'
    });

    return formatter.format(new Date(isoString));
  } catch {
    return new Date(isoString).toLocaleString();
  }
}

function normalizeTimeValue(value) {
  if (typeof value !== 'string') {
    return '15:00';
  }

  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) {
    return '15:00';
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  const safeHour = Math.min(23, Math.max(0, Number.isFinite(hour) ? hour : 15));
  const safeMinute = Math.min(59, Math.max(0, Number.isFinite(minute) ? minute : 0));

  return `${String(safeHour).padStart(2, '0')}:${String(safeMinute).padStart(2, '0')}`;
}

export default function GeoGridScheduleCard({
  businessId,
  schedule,
  timezone,
  isBusinessActive,
  canEdit
}) {
  const router = useRouter();
  const [currentSchedule, setCurrentSchedule] = useState(() => schedule ?? null);
  const [startTime, setStartTime] = useState(() => normalizeTimeValue(schedule?.startTimeLocal));
  const [availableKeywords, setAvailableKeywords] = useState(() => schedule?.availableKeywords ?? []);
  const [selectedKeywords, setSelectedKeywords] = useState(() => schedule?.selectedKeywords ?? []);
  const [status, setStatus] = useState({ message: '', tone: 'muted' });
  const [submitting, setSubmitting] = useState(false);

  const dayName = useMemo(() => {
    if (!currentSchedule) {
      return null;
    }

    const dayIndex = Number(currentSchedule.dayOfWeek ?? 0);
    return DAY_NAMES[(dayIndex + 7) % 7];
  }, [currentSchedule]);

  const nextRunLabel = useMemo(() => {
    if (!currentSchedule?.nextRunAt) {
      return null;
    }

    return formatDateTime(currentSchedule.nextRunAt, timezone);
  }, [currentSchedule, timezone]);

  const lastRunLabel = useMemo(() => {
    if (!currentSchedule?.lastRunAt) {
      return null;
    }

    return formatDateTime(currentSchedule.lastRunAt, timezone);
  }, [currentSchedule, timezone]);

  const statusMessage = useMemo(() => {
    if (!isBusinessActive) {
      return 'Business is inactive — weekly ranking reports are paused.';
    }

    if (!currentSchedule) {
      return 'Weekly ranking report schedule will be initialized shortly.';
    }

    if (!currentSchedule.isActive) {
      return 'Local ranking report schedule is paused.';
    }

    if (nextRunLabel) {
      return `Next run scheduled for ${nextRunLabel}.`;
    }

    return 'Next run time will be calculated soon.';
  }, [currentSchedule, isBusinessActive, nextRunLabel]);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!canEdit || !businessId) {
      return;
    }

    const keywordSelection = availableKeywords.length === 1 ? [availableKeywords[0]] : selectedKeywords;

    setSubmitting(true);
    setStatus({ message: '', tone: 'muted' });

    try {
      const response = await fetch(`/api/businesses/${businessId}/geo-grid/schedule`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startTime, keywords: keywordSelection })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update ranking report schedule.');
      }

      if (data.schedule) {
        setCurrentSchedule(data.schedule);
        setStartTime(normalizeTimeValue(data.schedule.startTimeLocal));
      }

      if (data.keywords) {
        if (Array.isArray(data.keywords.available)) {
          setAvailableKeywords(data.keywords.available);
        }

        if (Array.isArray(data.keywords.selected)) {
          setSelectedKeywords(data.keywords.selected);
        }
      }

      setStatus({ message: 'Ranking report schedule updated.', tone: 'success' });
      router.refresh();
    } catch (error) {
      setStatus({ message: error.message || 'Failed to update ranking report schedule.', tone: 'danger' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="surface-card surface-card--muted geo-schedule-card">
      <div className="surface-card__body">
        <h2 className="section-title">Weekly ranking report run</h2>
        <p className="section-caption">
          Automatically queue a ranking report run during mid-afternoon business hours once per week.
        </p>

        <div className="geo-schedule-card__status">
          <strong>{statusMessage}</strong>
          {lastRunLabel ? <div className="muted">Last run captured {lastRunLabel}.</div> : null}
        </div>

        {status.message ? (
          <div className={`geo-schedule-card__alert geo-schedule-card__alert--${status.tone}`} role="status">
            {status.message}
          </div>
        ) : null}

        <form className="geo-schedule-card__form" onSubmit={handleSubmit}>
          <div className="geo-schedule-card__field">
            <Label htmlFor="geo-schedule-day">Scheduled weekday</Label>
            <div id="geo-schedule-day" className="geo-schedule-card__value">
              {dayName || 'Pending'}
            </div>
          </div>

          <div className="geo-schedule-card__field">
            <Label htmlFor="geo-schedule-time">Local start time</Label>
            <Input
              id="geo-schedule-time"
              type="time"
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
              disabled={!canEdit || !isBusinessActive || submitting}
            />
            <p className="muted geo-schedule-card__hint">
              Runs must begin at least {currentSchedule?.leadMinutes ?? 120} minutes before closing.
            </p>
          </div>

          <div className="geo-schedule-card__field">
            <Label>Auto-scheduled keywords</Label>
            {availableKeywords.length === 0 ? (
              <p className="muted">Add an origin zone keyword to enable weekly ranking runs.</p>
            ) : (
              <div className="geo-schedule-card__keywords">
                {availableKeywords.map((keyword) => {
                  const checked = selectedKeywords.includes(keyword);
                  return (
                    <label key={keyword} className="geo-schedule-card__keyword" aria-label={`Schedule ${keyword}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          const { checked: isChecked } = event.target;
                          setSelectedKeywords((prev) => {
                            if (availableKeywords.length === 1) {
                              return [availableKeywords[0]];
                            }

                            const next = new Set(prev);
                            if (isChecked) {
                              next.add(keyword);
                            } else {
                              next.delete(keyword);
                            }
                            return Array.from(next);
                          });
                        }}
                        disabled={!canEdit || !isBusinessActive || submitting || availableKeywords.length === 1}
                      />
                      <span>{keyword}</span>
                    </label>
                  );
                })}
                <p className="muted geo-schedule-card__hint">
                  Only admins can select which keywords run each week. Choose one or more keywords to auto-schedule.
                </p>
              </div>
            )}
          </div>

          <div className="geo-schedule-card__actions">
            <Button type="submit" disabled={!canEdit || !isBusinessActive || submitting}>
              {submitting ? 'Saving…' : 'Save schedule'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
