'use client';

import { useState } from 'react';

export default function SessionList({ runs }) {
  const [collapsed, setCollapsed] = useState(true);

  const toggle = () => {
    setCollapsed((current) => !current);
  };

  const label = collapsed ? 'Show sessions' : 'Hide sessions';
  const countLabel = `${runs.length} session${runs.length === 1 ? '' : 's'}`;

  return (
    <section>
      <header className="ctr-session-header">
        <h3>Sessions</h3>
        <button type="button" onClick={toggle} className="ctr-session-toggle">
          {label} ({countLabel})
        </button>
      </header>
      {!collapsed ? (
        <ul className="ctr-session-list">
          {runs.map((run) => (
            <li key={run.runId}>
              <div className="ctr-session-head">
                <span>{run.runDateLabel}</span>
                <span>Run #{run.runId}</span>
              </div>
              <div className="ctr-session-metrics">
                <span>Avg position: <strong>{run.avgPosition ?? '—'}</strong></span>
                <span>SoLV (Top 3): <strong>{run.solvTop3 ? `${run.solvTop3}%` : '—'}</strong></span>
                <span>Ranked points: <strong>{run.rankedCount}</strong></span>
              </div>
              <div className="ctr-session-times">
                <span>Started: {run.startedAt ?? '—'}</span>
                <span>Finished: {run.finishedAt ?? '—'}</span>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      <style jsx>{`
        .ctr-session-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 0.5rem;
        }

        .ctr-session-toggle {
          border: 1px solid #d0d0d0;
          border-radius: 6px;
          padding: 0.35rem 0.75rem;
          background-color: #f7f7f7;
          cursor: pointer;
          font-size: 0.85rem;
        }

        .ctr-session-toggle:hover {
          background-color: #ededed;
        }

        .ctr-session-list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: grid;
          gap: 0.75rem;
        }

        .ctr-session-list li {
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          padding: 0.75rem 1rem;
          background-color: #fafafa;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .ctr-session-head {
          display: flex;
          justify-content: space-between;
          font-weight: 600;
        }

        .ctr-session-metrics {
          display: flex;
          flex-wrap: wrap;
          gap: 1rem;
          font-size: 0.95rem;
        }

        .ctr-session-times {
          display: flex;
          flex-wrap: wrap;
          gap: 1rem;
          font-size: 0.85rem;
          color: #555;
        }
      `}</style>
    </section>
  );
}
