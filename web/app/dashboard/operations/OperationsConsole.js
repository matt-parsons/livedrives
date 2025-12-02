'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import GeoGridLauncher from '../geo-grid-launcher/GeoGridLauncher';
import OperationsNavigation from './OperationsNavigation';

const LOG_SCOPE_OPTIONS = [
  { id: 'today', label: "Today's logs" },
  { id: 'all', label: 'All logs' }
];

const SCHEDULE_SCOPE_OPTIONS = [
  { id: 'today', label: "Today's sessions" },
  { id: 'all', label: 'All sessions' }
];

const SCHEDULE_VIEW_OPTIONS = [
  { id: 'grouped', label: 'Group by business' },
  { id: 'list', label: 'List view' }
];

const TAB_OPTIONS = [
  { id: 'logs', label: 'Run logs' },
  { id: 'geosearch', label: 'Ranking Report log' },
  { id: 'schedule', label: "Today's scheduled drives" },
  { id: 'geo', label: 'Ranking reports' },
  { id: 'launcher', label: 'Ranking report launcher' }
];

const TAB_IDS = new Set(TAB_OPTIONS.map((tab) => tab.id));

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

function getScheduleBusinessLabel(entry) {
  if (!entry) return 'Unassigned business';
  return (
    entry.businessName ??
    entry.companyId ??
    entry.businessId ??
    (entry.metadata && typeof entry.metadata === 'object'
      ? entry.metadata.businessName ?? entry.metadata.business ?? null
      : null) ??
    'Unassigned business'
  );
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

function formatDecimal(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '—';
  }

  const num = Number(value);

  if (!Number.isFinite(num)) {
    return '—';
  }

  return num.toFixed(digits);
}

export default function OperationsConsole({ timezone: initialTimezone, initialTab }) {
  const fallbackTimezone = initialTimezone || 'America/Phoenix';

  const [activeTab, setActiveTab] = useState(() => {
    if (initialTab && TAB_IDS.has(initialTab)) {
      return initialTab;
    }
    return 'logs';
  });
  const [logsScope, setLogsScope] = useState('today');
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState(null);
  const [logsData, setLogsData] = useState({ scope: 'today', timezone: fallbackTimezone, rows: [] });

  const [geoLogLoading, setGeoLogLoading] = useState(false);
  const [geoLogError, setGeoLogError] = useState(null);
  const [geoLogData, setGeoLogData] = useState(null);
  const [geoLogInitialized, setGeoLogInitialized] = useState(false);

  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleError, setScheduleError] = useState(null);
  const [scheduleData, setScheduleData] = useState({ timezone: fallbackTimezone, entries: [] });
  const [scheduleScope, setScheduleScope] = useState('today');
  const [scheduleView, setScheduleView] = useState('grouped');
  const [activeEventsLog, setActiveEventsLog] = useState(null);
  const [activeScheduleGroup, setActiveScheduleGroup] = useState(null);

  const [ctrPauseState, setCtrPauseState] = useState({ paused: false, updatedAt: null });
  const [ctrPauseLoading, setCtrPauseLoading] = useState(false);
  const [ctrPauseError, setCtrPauseError] = useState(null);

  const [geoRunsLoading, setGeoRunsLoading] = useState(false);
  const [geoRunsError, setGeoRunsError] = useState(null);
  const [geoRunsData, setGeoRunsData] = useState({ timezone: fallbackTimezone, runs: [] });
  const [geoRunsInitialized, setGeoRunsInitialized] = useState(false);

  const activeLogsTimezone = logsData?.timezone || fallbackTimezone;
  const activeScheduleTimezone = scheduleData?.timezone || fallbackTimezone;
  const activeGeoTimezone = geoRunsData?.timezone || fallbackTimezone;
  const geoLogLines = useMemo(() => (Array.isArray(geoLogData?.lines) ? geoLogData.lines : []), [geoLogData]);
  const geoLogTotalLines = Number.isFinite(geoLogData?.totalLines) ? Number(geoLogData.totalLines) : geoLogLines.length;
  const geoLogStartLine = Number.isFinite(geoLogData?.startLineNumber)
    ? geoLogData.startLineNumber
    : geoLogLines.length > 0
      ? Math.max(geoLogTotalLines - geoLogLines.length + 1, 1)
      : 0;
  const geoLogEndLine = geoLogStartLine > 0 ? geoLogStartLine + geoLogLines.length - 1 : 0;
  const geoLogPath = typeof geoLogData?.path === 'string' && geoLogData.path.length
    ? geoLogData.path
    : '/var/log/geosearch.log';
  const geoLogTruncated = Boolean(geoLogData?.truncated);
  const geoLogLastModified = geoLogData?.lastModified ?? null;
  const geoLogExists = geoLogData?.exists !== false;
  const geoLogLimit = Number.isFinite(geoLogData?.limit) ? Number(geoLogData.limit) : null;
  const geoLogLineCount = geoLogLines.length;
  const geoLogStatusLabel = geoLogLoading
    ? 'Loading…'
    : !geoLogExists
      ? 'Log file unavailable'
      : geoLogTotalLines === 0
        ? 'Log file is empty'
        : geoLogTruncated
          ? `Showing last ${geoLogLineCount} of ${geoLogTotalLines} lines`
          : `${geoLogLineCount} line${geoLogLineCount === 1 ? '' : 's'} loaded`;
  const geoLogRangeLabel = geoLogExists && geoLogStartLine > 0 && geoLogEndLine >= geoLogStartLine
    ? geoLogEndLine > geoLogStartLine
      ? `Lines ${geoLogStartLine} – ${geoLogEndLine}`
      : `Line ${geoLogStartLine}`
    : null;
  const geoLogLastUpdatedLabel = geoLogLastModified
    ? formatDateTime(geoLogLastModified, fallbackTimezone, { timeStyle: 'medium' })
    : null;
  const activeEventsTimestampLabel = activeEventsLog?.timestamp
    ? formatDateTime(activeEventsLog.timestamp, activeLogsTimezone, { timeStyle: 'medium' })
    : null;

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

  const loadGeoLog = useCallback(async () => {
    setGeoLogLoading(true);
    setGeoLogError(null);

    try {
      const response = await fetch('/api/system/geosearch-log', {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store'
      });

      const text = await response.text();
      let payload;

      if (text) {
        try {
          payload = JSON.parse(text);
        } catch (parseError) {
          throw new Error('Received malformed GeoSearch log response.');
        }
      } else {
        payload = { lines: [] };
      }

      if (!response.ok) {
        const error = new Error(payload?.error ?? `Failed to load GeoSearch log (status ${response.status})`);
        error.status = response.status;
        error.payload = payload;
        throw error;
      }

      setGeoLogData(payload);
    } catch (caughtError) {
      if (caughtError?.payload) {
        setGeoLogData(caughtError.payload);
      }

      setGeoLogError(caughtError);
    } finally {
      setGeoLogLoading(false);
      setGeoLogInitialized(true);
    }
  }, []);

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

  const refreshCtrPause = useCallback(async () => {
    setCtrPauseLoading(true);
    setCtrPauseError(null);

    try {
      const response = await fetch('/api/system/ctr-pause', {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store'
      });

      if (!response.ok) {
        throw new Error(`Failed to load CTR pause state (status ${response.status})`);
      }

      const payload = await response.json();
      setCtrPauseState(payload);
    } catch (error) {
      setCtrPauseError(error);
    } finally {
      setCtrPauseLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLogs(logsScope);
  }, [loadLogs, logsScope]);

  useEffect(() => {
    refreshSchedule();
  }, [refreshSchedule]);

  useEffect(() => {
    refreshCtrPause();
  }, [refreshCtrPause]);

  useEffect(() => {
    if (activeTab === 'geosearch' && !geoLogInitialized && !geoLogLoading) {
      loadGeoLog();
    }
  }, [activeTab, geoLogInitialized, geoLogLoading, loadGeoLog]);

  const loadGeoRuns = useCallback(async () => {
    setGeoRunsLoading(true);
    setGeoRunsError(null);
    setGeoRunsInitialized(true);

    try {
      const response = await fetch('/api/geo-grid/runs', {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store'
      });

      if (!response.ok) {
        throw new Error(`Failed to load geo map runs (status ${response.status})`);
      }

      const payload = await response.json();
      setGeoRunsData(payload);
    } catch (error) {
      setGeoRunsError(error);
    } finally {
      setGeoRunsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'geo' && !geoRunsInitialized && !geoRunsLoading) {
      loadGeoRuns();
    }
  }, [activeTab, geoRunsInitialized, geoRunsLoading, loadGeoRuns]);

  const allScheduleEntries = useMemo(() => {
    const entries = Array.isArray(scheduleData?.entries) ? scheduleData.entries : [];

    return entries
      .filter((entry) => entry)
      .map((entry) => ({ ...entry }))
      .sort((a, b) => {
        const aDate = new Date(a.runAt);
        const bDate = new Date(b.runAt);
        if (Number.isNaN(aDate.getTime()) && Number.isNaN(bDate.getTime())) {
          return 0;
        }
        if (Number.isNaN(aDate.getTime())) {
          return 1;
        }
        if (Number.isNaN(bDate.getTime())) {
          return -1;
        }
        return aDate - bDate;
      });
  }, [scheduleData]);

  const scheduleEntries = useMemo(() => {
    if (scheduleScope !== 'today') {
      return allScheduleEntries;
    }

    const todayKey = getDateKey(new Date(), activeScheduleTimezone);
    return allScheduleEntries.filter((entry) => getDateKey(entry.runAt, activeScheduleTimezone) === todayKey);
  }, [allScheduleEntries, scheduleScope, activeScheduleTimezone]);

  const scheduleGroups = useMemo(() => {
    const map = new Map();

    scheduleEntries.forEach((entry) => {
      const key = entry.businessId ?? entry.companyId ?? getScheduleBusinessLabel(entry);
      if (!map.has(key)) {
        map.set(key, {
          key,
          businessName: getScheduleBusinessLabel(entry),
          entries: []
        });
      }

      map.get(key).entries.push(entry);
    });

    return Array.from(map.values())
      .map((group) => ({
        ...group,
        entries: group.entries
          .slice()
          .sort((a, b) => new Date(a.runAt) - new Date(b.runAt))
      }))
      .sort((a, b) => a.businessName.localeCompare(b.businessName, 'en', { sensitivity: 'base' }));
  }, [scheduleEntries]);

  const geoRuns = useMemo(() => {
    return Array.isArray(geoRunsData?.runs) ? geoRunsData.runs : [];
  }, [geoRunsData]);

  const ctrPaused = Boolean(ctrPauseState?.paused);
  const ctrPauseUpdatedLabel = ctrPauseState?.updatedAt
    ? formatDateTime(ctrPauseState.updatedAt, activeScheduleTimezone, { timeStyle: 'medium' })
    : null;

  const toggleCtrPause = useCallback(async () => {
    setCtrPauseLoading(true);
    setCtrPauseError(null);

    try {
      const response = await fetch('/api/system/ctr-pause', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ paused: !ctrPaused })
      });

      if (!response.ok) {
        throw new Error(`Failed to update CTR pause state (status ${response.status})`);
      }

      const payload = await response.json();
      setCtrPauseState(payload);
    } catch (error) {
      setCtrPauseError(error);
    } finally {
      setCtrPauseLoading(false);
    }
  }, [ctrPaused]);

  return (
    <div className="page-shell__body operations-layout">
      <aside className="page-shell__sidebar" aria-label="Operations navigation">
        <OperationsNavigation activeTab={activeTab} onTabSelect={setActiveTab} tabOptions={TAB_OPTIONS} />
      </aside>

      <div className="page-shell__content operations-layout__content">
        {activeTab === 'logs' ? (
          <section
            id="operations-panel-logs"
            className="section"
            role="tabpanel"
            aria-labelledby="operations-tab-logs"
          >
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
                <div className="logs-toolbar__actions">
                  <Link className="toolbar-link" href="/runs">
                    View run dashboard
                  </Link>
                  <button
                    type="button"
                    className="refresh-button"
                    onClick={() => loadLogs(logsScope)}
                    disabled={logsLoading}
                  >
                    Refresh
                  </button>
                </div>
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
                              <button
                                type="button"
                                className="log-events-button"
                                onClick={() => {
                                  setActiveEventsLog({
                                    id: row.id,
                                    businessName: row.business_name ?? row.business_id ?? '—',
                                    keyword: row.keyword ?? null,
                                    status: status.label,
                                    timestamp: row.timestamp_utc || row.created_at,
                                    events
                                  });
                                }}
                              >
                                View {events.length} event{events.length === 1 ? '' : 's'}
                              </button>
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
        ) : null}

      {activeTab === 'geosearch' ? (
        <section
          id="operations-panel-geosearch"
          className="section"
          role="tabpanel"
          aria-labelledby="operations-tab-geosearch"
        >
          <div className="section-header">
            <div>
              <h2 className="section-title">GeoSearch log</h2>
              <p className="section-caption">
                Tail the GeoSearch service output without leaving the operations workspace.
              </p>
            </div>
          </div>

          <div className="surface-card">
            <div className="logs-toolbar">
              <div className="logs-toolbar__meta">
                <span className="status-pill">{geoLogStatusLabel}</span>
                {geoLogRangeLabel ? (
                  <span className="status-pill status-pill--muted">{geoLogRangeLabel}</span>
                ) : null}
                {geoLogLastUpdatedLabel ? (
                  <span className="status-pill status-pill--muted">Updated {geoLogLastUpdatedLabel}</span>
                ) : null}
              </div>
              <div className="logs-toolbar__actions">
                <button type="button" className="refresh-button" onClick={loadGeoLog} disabled={geoLogLoading}>
                  Refresh
                </button>
              </div>
            </div>

            <div className="log-file-meta">
              <span>
                Source: <code className="code-inline">{geoLogPath}</code>
              </span>
              {geoLogLimit ? (
                <span>
                  Limit: {geoLogLimit} line{geoLogLimit === 1 ? '' : 's'}
                </span>
              ) : null}
            </div>

            {geoLogError ? (
              <div className="inline-error" role="alert">
                <strong>Unable to load the GeoSearch log.</strong>
                <span>{geoLogError.message}</span>
                {!geoLogExists ? (
                  <span>
                    Expected log at <code className="code-inline">{geoLogPath}</code>
                  </span>
                ) : null}
              </div>
            ) : null}

            <div className="log-file-viewer" role="log" aria-live="polite">
              {geoLogLoading && geoLogLineCount === 0 ? (
                <p className="log-file-viewer__placeholder">Loading GeoSearch log…</p>
              ) : null}

              {!geoLogLoading && geoLogLineCount === 0 ? (
                <p className="log-file-viewer__placeholder">
                  {geoLogExists
                    ? 'GeoSearch log is currently empty.'
                    : 'GeoSearch log file is unavailable at the configured path.'}
                </p>
              ) : null}

              {geoLogLines.map((line, index) => {
                const lineNumber = geoLogStartLine > 0 ? geoLogStartLine + index : index + 1;
                return (
                  <div key={`${lineNumber}-${index}`} className="log-file-viewer__line">
                    <span className="log-file-viewer__line-number">{lineNumber}</span>
                    <span className="log-file-viewer__line-content">{line || ' '}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === 'schedule' ? (
        <section
          id="operations-panel-schedule"
          className="section"
          role="tabpanel"
          aria-labelledby="operations-tab-schedule"
        >
          <div className="section-header">
            <div>
              <h2 className="section-title">Today’s scheduled drives</h2>
              <p className="section-caption">
                Review the jobs queued for execution today. Data is sourced from the scheduler log feed.
              </p>
            </div>
            <div className="logs-toolbar__actions" style={{ gap: 12 }}>
              <button
                type="button"
                className="refresh-button"
                onClick={toggleCtrPause}
                disabled={ctrPauseLoading}
              >
                {ctrPaused ? 'Resume sessions' : 'Pause all sessions'}
              </button>
              <button
                type="button"
                className="refresh-button"
                onClick={refreshSchedule}
                disabled={scheduleLoading}
              >
                Refresh
              </button>
            </div>
          </div>

          <div className="surface-card">
            <div className="logs-toolbar">
              <div className="logs-toolbar__meta" style={{ flexWrap: 'wrap', rowGap: 8 }}>
                <span className="status-pill" data-status={ctrPaused ? 'inactive' : 'active'}>
                  {ctrPaused ? 'CTR sessions paused' : 'CTR sessions active'}
                </span>
                {ctrPauseUpdatedLabel ? (
                  <span className="status-pill status-pill--muted">Updated {ctrPauseUpdatedLabel}</span>
                ) : null}
                {ctrPauseError ? (
                  <span className="status-pill status-pill--muted">{ctrPauseError.message}</span>
                ) : null}
              </div>
              <div className="logs-toolbar__actions">
                <button
                  type="button"
                  className="refresh-button"
                  onClick={refreshCtrPause}
                  disabled={ctrPauseLoading}
                >
                  Check status
                </button>
              </div>
            </div>

            <div className="logs-toolbar">
              <div className="logs-toolbar__meta">
                <span className="status-pill">
                  {scheduleLoading
                    ? 'Loading…'
                    : `${scheduleEntries.length} scheduled session${scheduleEntries.length === 1 ? '' : 's'}`}
                </span>
                <span className="status-pill status-pill--muted">Timezone: {activeScheduleTimezone}</span>
              </div>
              <div className="logs-toolbar__actions">
                <div className="log-scope-control" role="group" aria-label="Schedule scope">
                  {SCHEDULE_SCOPE_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={
                        option.id === scheduleScope
                          ? 'segmented-button segmented-button--active'
                          : 'segmented-button'
                      }
                      onClick={() => setScheduleScope(option.id)}
                      disabled={scheduleLoading && option.id === scheduleScope}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <div className="log-scope-control" role="group" aria-label="Schedule view mode">
                  {SCHEDULE_VIEW_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={
                        option.id === scheduleView
                          ? 'segmented-button segmented-button--active'
                          : 'segmented-button'
                      }
                      onClick={() => setScheduleView(option.id)}
                      disabled={scheduleLoading && option.id === scheduleView}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          
          {scheduleError ? (
            <div className="inline-error" role="alert">
              <strong>Unable to load the scheduler feed.</strong>
              <span>{scheduleError.message}</span>
            </div>
          ) : null}

          {scheduleView === 'grouped' ? (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ minWidth: 200 }}>Business</th>
                    <th style={{ minWidth: 120 }}>Sessions</th>
                    <th style={{ minWidth: 160 }}>Next session</th>
                    <th style={{ minWidth: 140 }} aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {scheduleLoading && scheduleGroups.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="table-placeholder">
                        Loading schedule…
                      </td>
                    </tr>
                  ) : null}

                  {!scheduleLoading && scheduleGroups.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="table-placeholder">
                        {scheduleScope === 'all'
                          ? 'No scheduled sessions were found in the log feed.'
                          : 'No runs are scheduled for today.'}
                      </td>
                    </tr>
                  ) : null}

                  {scheduleGroups.map((group) => {
                    const now = Date.now();
                    const nextEntry = group.entries.find((entry) => {
                      const timestamp = new Date(entry.runAt).getTime();
                      return Number.isFinite(timestamp) && timestamp >= now;
                    });
                    const fallbackEntry = group.entries[0];
                    const runForLabel = nextEntry ?? fallbackEntry;
                    const nextRunLabel = runForLabel
                      ? scheduleScope === 'today'
                        ? formatTime(runForLabel.runAt, activeScheduleTimezone)
                        : formatDateTime(runForLabel.runAt, activeScheduleTimezone)
                      : '—';

                    return (
                      <tr key={group.key}>
                        <td>{group.businessName}</td>
                        <td>{group.entries.length}</td>
                        <td>{nextRunLabel || '—'}</td>
                        <td>
                          <button
                            type="button"
                            className="log-events-button"
                            onClick={() =>
                              setActiveScheduleGroup({
                                key: group.key,
                                businessName: group.businessName,
                                entries: group.entries
                              })
                            }
                          >
                            View schedule
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ minWidth: 160 }}>Scheduled for</th>
                    <th style={{ minWidth: 200 }}>Business</th>
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
                        {scheduleScope === 'all'
                          ? 'No scheduled sessions were found in the log feed.'
                          : 'No runs are scheduled for today.'}
                      </td>
                    </tr>
                  ) : null}

                  {scheduleEntries.map((entry, index) => (
                    <tr key={`${entry.runAt ?? 'unknown'}-${index}`}>
                      <td>{formatDateTime(entry.runAt, activeScheduleTimezone) || '—'}</td>
                      <td>{getScheduleBusinessLabel(entry)}</td>
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
          )}
        </div>
        </section>
      ) : null}

      {activeTab === 'geo' ? (
        <section
          id="operations-panel-geo"
          className="section"
          role="tabpanel"
          aria-labelledby="operations-tab-geo"
        >
          <div className="section-header">
            <div>
              <h2 className="section-title">Geo map runs</h2>
              <p className="section-caption">
                Review the full history of ranking reports across your managed businesses and refresh results on demand.
              </p>
            </div>
            <button type="button" className="refresh-button" onClick={loadGeoRuns} disabled={geoRunsLoading}>
              Refresh
            </button>
          </div>

          <div className="surface-card">
            <div className="logs-toolbar">
              <div className="logs-toolbar__meta">
                <span className="status-pill">
                  {geoRunsLoading
                    ? 'Loading…'
                    : `${geoRuns.length} geo map run${geoRuns.length === 1 ? '' : 's'}`}
                </span>
                <span className="status-pill status-pill--muted">Timezone: {activeGeoTimezone}</span>
              </div>
            </div>

            {geoRunsError ? (
              <div className="inline-error" role="alert">
                <strong>Unable to load geo map runs.</strong>
                <span>{geoRunsError.message}</span>
              </div>
            ) : null}

            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ minWidth: 120 }}>Run ID</th>
                    <th style={{ minWidth: 200 }}>Business</th>
                    <th style={{ minWidth: 160 }}>Keyword</th>
                    <th style={{ minWidth: 140 }}>Status</th>
                    <th style={{ minWidth: 180 }}>Created</th>
                    <th style={{ minWidth: 180 }}>Finished</th>
                    <th style={{ minWidth: 140 }}>Grid</th>
                    <th style={{ minWidth: 120 }}>Radius (mi)</th>
                    <th style={{ minWidth: 120 }}>Spacing (mi)</th>
                    <th style={{ minWidth: 160 }}>Ranked points</th>
                    <th style={{ minWidth: 140 }}>Top 3 points</th>
                    <th style={{ minWidth: 140 }}>Avg rank</th>
                    <th style={{ minWidth: 180 }}>Last measured</th>
                  </tr>
                </thead>
                <tbody>
                  {geoRunsLoading && geoRuns.length === 0 ? (
                    <tr>
                      <td colSpan={13} className="table-placeholder">
                        Loading geo map runs…
                      </td>
                    </tr>
                  ) : null}

                  {!geoRunsLoading && geoRuns.length === 0 ? (
                    <tr>
                      <td colSpan={13} className="table-placeholder">
                        No geo map runs found for your organization.
                      </td>
                    </tr>
                  ) : null}

                  {geoRuns.map((run) => (
                    <tr key={run.id}>
                      <td>{run.id}</td>
                      <td>{run.businessName ?? run.businessId ?? '—'}</td>
                      <td>{run.keyword ?? '—'}</td>
                      <td>{run.status ?? '—'}</td>
                      <td>{formatDateTime(run.createdAt, activeGeoTimezone)}</td>
                      <td>{formatDateTime(run.finishedAt, activeGeoTimezone)}</td>
                      <td>
                        {run.gridRows != null && run.gridCols != null
                          ? `${run.gridRows} × ${run.gridCols}`
                          : '—'}
                      </td>
                      <td>{run.radiusMiles != null ? formatDecimal(run.radiusMiles, 1) : '—'}</td>
                      <td>{run.spacingMiles != null ? formatDecimal(run.spacingMiles, 2) : '—'}</td>
                      <td>
                        {run.totalPoints != null
                          ? `${run.rankedPoints ?? 0} / ${run.totalPoints}`
                          : '—'}
                      </td>
                      <td>
                        {run.totalPoints != null
                          ? `${run.top3Points ?? 0} / ${run.totalPoints}`
                          : '—'}
                      </td>
                      <td>{formatDecimal(run.avgRank)}</td>
                      <td>{formatDateTime(run.lastMeasuredAt, activeGeoTimezone)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === 'launcher' ? (
        <section
          id="operations-panel-launcher"
          className="section"
          role="tabpanel"
          aria-labelledby="operations-tab-launcher"
        >
          <div className="section-header">
            <div>
              <h2 className="section-title">Ranking report launcher</h2>
              <p className="section-caption">
                Spin up fresh ranking reports without leaving the operations workspace. Configure your business, keyword,
                and grid settings in one place.
              </p>
            </div>
          </div>

          <GeoGridLauncher showHeader={false} />
        </section>
      ) : null}

      <Dialog
        open={Boolean(activeScheduleGroup)}
        onOpenChange={(open) => {
          if (!open) {
            setActiveScheduleGroup(null);
          }
        }}
      >
        {activeScheduleGroup ? (
          <DialogContent className="schedule-dialog__content">
            <DialogHeader>
              <DialogTitle>Scheduled sessions</DialogTitle>
              <DialogDescription>
                Showing {activeScheduleGroup.entries.length} scheduled session
                {activeScheduleGroup.entries.length === 1 ? '' : 's'} for this business.
              </DialogDescription>
            </DialogHeader>

            <div className="schedule-dialog__meta">
              <span>
                <strong>Business:</strong> {activeScheduleGroup.businessName}
              </span>
              <span>
                <strong>Timezone:</strong> {activeScheduleTimezone}
              </span>
            </div>

            <div className="schedule-dialog__timeline" role="list">
              {activeScheduleGroup.entries.map((entry, index) => {
                const scheduledLabel = formatDateTime(entry.runAt, activeScheduleTimezone);
                return (
                  <div
                    key={`${entry.runAt ?? 'unknown'}-${index}`}
                    className="schedule-dialog__timeline-item"
                    role="listitem"
                  >
                    <div className="schedule-dialog__timeline-time">
                      {scheduledLabel || 'Unknown time'}
                    </div>
                    <div className="schedule-dialog__timeline-details">
                      {entry.driveIndex != null ? (
                        <span className="schedule-dialog__timeline-pill">Drive {entry.driveIndex}</span>
                      ) : null}
                      {entry.configPath ? (
                        <span className="schedule-dialog__timeline-pill">{entry.configPath}</span>
                      ) : null}
                      {entry.source ? (
                        <span className="schedule-dialog__timeline-pill">Source: {entry.source}</span>
                      ) : null}
                    </div>
                    {entry.metadata ? (
                      <div className="schedule-dialog__timeline-metadata">
                        <code className="code-inline">{JSON.stringify(entry.metadata)}</code>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </DialogContent>
        ) : null}
      </Dialog>

      <Dialog
        open={Boolean(activeEventsLog)}
        onOpenChange={(open) => {
          if (!open) {
            setActiveEventsLog(null);
          }
        }}
      >
        {activeEventsLog ? (
          <DialogContent className="log-events-dialog__content">
            <DialogHeader>
              <DialogTitle>Run events</DialogTitle>
              <DialogDescription>
                Showing {activeEventsLog.events.length} event
                {activeEventsLog.events.length === 1 ? '' : 's'} captured for this log entry.
              </DialogDescription>
            </DialogHeader>

            <div className="log-events-dialog__meta">
              <span>
                <strong>Business:</strong> {activeEventsLog.businessName ?? '—'}
              </span>
              {activeEventsLog.keyword ? (
                <span>
                  <strong>Keyword:</strong> {activeEventsLog.keyword}
                </span>
              ) : null}
              {activeEventsLog.status ? (
                <span>
                  <strong>Status:</strong> {activeEventsLog.status}
                </span>
              ) : null}
              {activeEventsTimestampLabel ? (
                <span>
                  <strong>Timestamp:</strong> {activeEventsTimestampLabel}
                </span>
              ) : null}
            </div>

            <div className="log-events-dialog__body" role="log" aria-live="polite">
              {activeEventsLog.events.map((event, index) => (
                <div key={event.id ?? index} className="log-events-dialog__event">
                  <div className="log-events-dialog__event-index">Event {index + 1}</div>
                  <div className="log-events-dialog__event-message">{event.message}</div>
                  {event.image ? (
                    <a
                      href={"/drive-logs/" + event.image}
                      target="_blank"
                      rel="noreferrer"
                      className="log-events-dialog__event-link"
                    >
                      View asset
                    </a>
                  ) : null}
                </div>
              ))}
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
      </div>
    </div>
  );
}
