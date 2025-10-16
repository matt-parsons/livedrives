'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

const LOG_SCOPE_OPTIONS = [
  { id: 'today', label: "Today's logs" },
  { id: 'all', label: 'All logs' }
];

function formatDateTime(value, timezone, options = {}) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const { dateStyle = 'medium', timeStyle = 'short' } = options;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    dateStyle,
    timeStyle
  }).format(date);
}

function formatTime(value, timezone) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
}

function getDateKey(value, timezone) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(date);
}

function getLogStatus(log) {
  if (!log) return { label: 'Unknown', tone: 'muted' };
  if (log.reason === 'success') {
    return { label: 'Success', tone: 'success' };
  }
  if (typeof log.reason === 'string' && log.reason.length > 0) {
    return { label: log.reason.replace(/_/g, ' '), tone: 'danger' };
  }
  return { label: 'Info', tone: 'muted' };
}

function normalizeEvents(events) {
  if (!Array.isArray(events)) return [];
  return events.map((event, index) => {
    if (typeof event === 'string') {
      return { id: index, message: event };
    }
    if (event && typeof event === 'object') {
      return {
        id: index,
        message: event.msg ?? '(no message)',
        image: event.img ?? null
      };
    }
    return { id: index, message: JSON.stringify(event) };
  });
}

export default function OperationsConsole({ timezone: initialTimezone }) {
  const fallbackTimezone = initialTimezone || 'America/Phoenix';

  const [logsScope, setLogsScope] = useState('today');
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState(null);
  const [logsData, setLogsData] = useState({ scope: 'today', timezone: fallbackTimezone, rows: [] });

  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleError, setScheduleError] = useState(null);
  const [scheduleData, setScheduleData] = useState({ timezone: fallbackTimezone, entries: [] });

  const activeLogsTimezone = logsData?.timezone || fallbackTimezone;
  const activeScheduleTimezone = scheduleData?.timezone || fallbackTimezone;

  const loadLogs = useCallback(
    async (scope) => {
      setLogsLoading(true);
      setLogsError(null);

      try {
        const response = await fetch(`/api/logs?scope=${scope}`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          cache: 'no-store'
        });

        if (!response.ok) {
          throw new Error(`Failed to load logs (status ${response.status})`);
        }

        const payload = await response.json();
        setLogsData(payload);
      } catch (error) {
        setLogsError(error);
      } finally {
        setLogsLoading(false);
      }
    },
    []
  );

  const refreshSchedule = useCallback(async () => {
    setScheduleLoading(true);
    setScheduleError(null);

    try {
      const response = await fetch('/api/schedule', {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store'
      });

      if (!response.ok) {
        throw new Error(`Failed to load schedule (status ${response.status})`);
      }

      const payload = await response.json();
      setScheduleData(payload);
    } catch (error) {
      setScheduleError(error);
    } finally {
      setScheduleLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLogs(logsScope);
  }, [loadLogs, logsScope]);

  useEffect(() => {
    refreshSchedule();
  }, [refreshSchedule]);

  const scheduleEntries = useMemo(() => {
    const entries = Array.isArray(scheduleData?.entries) ? scheduleData.entries : [];
    const todayKey = getDateKey(new Date(), activeScheduleTimezone);

    return entries
      .filter((entry) => {
        const key = getDateKey(entry.runAt, activeScheduleTimezone);
        return key === todayKey;
      })
      .sort((a, b) => {
        const aDate = new Date(a.runAt);
        const bDate = new Date(b.runAt);
        return aDate - bDate;
      });
  }, [scheduleData, activeScheduleTimezone]);

  return (
    <div className="operations-layout">
      <section className="section">
        <div className="section-header">
          <div>
            <h2 className="section-title">Run logs</h2>
            <p className="section-caption">
              Inspect automated drive sessions for the current day or the full historical backlog.
            </p>
          </div>
          <div className="log-scope-control" role="group" aria-label="Log scope">
            {LOG_SCOPE_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={option.id === logsScope ? 'segmented-button segmented-button--active' : 'segmented-button'}
                onClick={() => setLogsScope(option.id)}
                disabled={logsLoading && option.id === logsScope}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="surface-card">
          <div className="logs-toolbar">
            <div className="logs-toolbar__meta">
              <span className="status-pill">
                {logsLoading ? 'Loading…' : `${logsData?.rows?.length ?? 0} log entries`}
              </span>
              <span className="status-pill status-pill--muted">Timezone: {activeLogsTimezone}</span>
            </div>
            <button type="button" className="refresh-button" onClick={() => loadLogs(logsScope)} disabled={logsLoading}>
              Refresh
            </button>
          </div>

          {logsError ? (
            <div className="inline-error" role="alert">
              <strong>Unable to load logs.</strong>
              <span>{logsError.message}</span>
            </div>
          ) : null}

          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 180 }}>Timestamp</th>
                  <th style={{ minWidth: 120 }}>Status</th>
                  <th style={{ minWidth: 160 }}>Business</th>
                  <th style={{ minWidth: 160 }}>Keyword</th>
                  <th style={{ minWidth: 80 }}>Rank</th>
                  <th style={{ minWidth: 140 }}>Origin</th>
                  <th style={{ minWidth: 120 }}>Device</th>
                  <th style={{ minWidth: 140 }}>CTR IP</th>
                  <th style={{ minWidth: 140 }}>Drive IP</th>
                  <th style={{ minWidth: 120 }}>Duration (min)</th>
                  <th style={{ minWidth: 180 }}>Events</th>
                  <th style={{ minWidth: 180 }}>Steps</th>
                </tr>
              </thead>
              <tbody>
                {logsLoading && (!logsData?.rows || logsData.rows.length === 0) ? (
                  <tr>
                    <td colSpan={12} className="table-placeholder">
                      Loading log entries…
                    </td>
                  </tr>
                ) : null}

                {!logsLoading && (!logsData?.rows || logsData.rows.length === 0) ? (
                  <tr>
                    <td colSpan={12} className="table-placeholder">
                      No log entries found for the selected scope.
                    </td>
                  </tr>
                ) : null}

                {(logsData?.rows ?? []).map((row) => {
                  const status = getLogStatus(row);
                  const events = normalizeEvents(row.events);

                  return (
                    <tr key={row.id} className={`log-row log-row--${status.tone}`}>
                      <td>{formatDateTime(row.timestamp_utc || row.created_at, activeLogsTimezone)}</td>
                      <td>
                        <span className={`log-status log-status--${status.tone}`}>{status.label}</span>
                      </td>
                      <td>{row.business_name ?? row.business_id ?? '—'}</td>
                      <td>{row.keyword ?? '—'}</td>
                      <td>{row.rank ?? '—'}</td>
                      <td>
                        {typeof row.origin === 'object' && row.origin !== null
                          ? `${row.origin.lat ?? ''}, ${row.origin.lng ?? ''}`.trim()
                          : row.origin ?? '—'}
                      </td>
                      <td>{row.device ?? '—'}</td>
                      <td>{row.ctr_ip_address ?? '—'}</td>
                      <td>{row.drive_ip_address ?? '—'}</td>
                      <td>{row.duration_min != null ? row.duration_min : '—'}</td>
                      <td>
                        {events.length === 0 ? (
                          <span className="muted">No events</span>
                        ) : (
                          <details>
                            <summary>{events.length} event{events.length === 1 ? '' : 's'}</summary>
                            <ul className="log-event-list">
                              {events.map((event) => (
                                <li key={event.id}>
                                  <div>{event.message}</div>
                                  {event.image ? (
                                    <a href={event.image} target="_blank" rel="noreferrer">
                                      View asset
                                    </a>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </td>
                      <td>
                        {Array.isArray(row.steps) && row.steps.length > 0 ? (
                          <details>
                            <summary>{row.steps.length} step{row.steps.length === 1 ? '' : 's'}</summary>
                            <ul className="log-step-list">
                              {row.steps.map((step, index) => (
                                <li key={index}>{typeof step === 'string' ? step : JSON.stringify(step)}</li>
                              ))}
                            </ul>
                          </details>
                        ) : (
                          <span className="muted">No steps</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-header">
          <div>
            <h2 className="section-title">Today’s scheduled drives</h2>
            <p className="section-caption">
              Review the jobs queued for execution today. Data is sourced from the scheduler log feed.
            </p>
          </div>
          <button
            type="button"
            className="refresh-button"
            onClick={refreshSchedule}
            disabled={scheduleLoading}
          >
            Refresh
          </button>
        </div>

        <div className="surface-card">
          <div className="logs-toolbar">
            <div className="logs-toolbar__meta">
              <span className="status-pill">
                {scheduleLoading ? 'Loading…' : `${scheduleEntries.length} scheduled run${scheduleEntries.length === 1 ? '' : 's'}`}
              </span>
              <span className="status-pill status-pill--muted">Timezone: {activeScheduleTimezone}</span>
            </div>
          </div>

          {scheduleError ? (
            <div className="inline-error" role="alert">
              <strong>Unable to load the scheduler feed.</strong>
              <span>{scheduleError.message}</span>
            </div>
          ) : null}

          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 120 }}>Time</th>
                  <th style={{ minWidth: 120 }}>Business</th>
                  <th style={{ minWidth: 120 }}>Drive #</th>
                  <th style={{ minWidth: 220 }}>Config</th>
                  <th style={{ minWidth: 200 }}>Metadata</th>
                </tr>
              </thead>
              <tbody>
                {scheduleLoading && scheduleEntries.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="table-placeholder">
                      Loading schedule…
                    </td>
                  </tr>
                ) : null}

                {!scheduleLoading && scheduleEntries.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="table-placeholder">
                      No runs are scheduled for today.
                    </td>
                  </tr>
                ) : null}

                {scheduleEntries.map((entry, index) => (
                  <tr key={`${entry.runAt ?? 'unknown'}-${index}`}>
                    <td>{formatTime(entry.runAt, activeScheduleTimezone)}</td>
                    <td>{entry.businessId ?? '—'}</td>
                    <td>{entry.driveIndex != null ? entry.driveIndex : '—'}</td>
                    <td>{entry.configPath ?? '—'}</td>
                    <td>
                      {entry.metadata ? (
                        <code className="code-inline">{JSON.stringify(entry.metadata)}</code>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
