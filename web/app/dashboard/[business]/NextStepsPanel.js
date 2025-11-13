'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

export default function NextStepsPanel({ steps = [], optimizationHref = null, loading, error }) {
  const [activeTask, setActiveTask] = useState(null);

  const hasTasks = Array.isArray(steps) && steps.length > 0;

  const overlayDescription = useMemo(() => {
    if (!activeTask) {
      return '';
    }

    return activeTask.detail || 'Follow the Google Business Profile checklist items to resolve this.';
  }, [activeTask]);

  useEffect(() => {
    if (!activeTask) {
      return;
    }

    const handleKeyUp = (event) => {
      if (event.key === 'Escape') {
        setActiveTask(null);
      }
    };

    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [activeTask]);

  useEffect(() => {
    if (!activeTask) {
      return;
    }

    const isStillSelected = steps.some((task) => task.id === activeTask.id);
    if (!isStillSelected) {
      setActiveTask(null);
    }
  }, [steps, activeTask]);

  const handleTaskClick = (task) => {
    setActiveTask(task);
  };

  const closeOverlay = () => setActiveTask(null);

  return (
    <section className="section next-steps-panel">
      <div className="surface-card surface-card--muted surface-card--compact">
        <div className="section-header">
          <div>
            <h2 className="section-title">Next steps to improve your profile</h2>
            <p className="section-caption">
              Focus on these tasks to strengthen your local visibility.
            </p>
          </div>
          <Link className="cta-link" href={optimizationHref ?? '#'}>
            Explore full roadmap ↗
          </Link>
        </div>

        {loading ? (
          <p className="next-steps-panel__message">Gathering suggestions…</p>
        ) : error ? (
          <div className="inline-error" role="status" style={{ marginTop: '0.75rem' }}>
            <strong>Unable to contact Google Places</strong>
            <span>{error}</span>
          </div>
        ) : !hasTasks ? (
          <p className="next-steps-panel__message">
            Great work! Automated checks did not surface additional actions right now.
          </p>
        ) : (
          <ul className="next-steps-panel__list">
            {steps.map((task) => (
              <li key={task.id}>
                <button
                  type="button"
                  className="next-steps-panel__item"
                  onClick={() => handleTaskClick(task)}
                >
                  <div className="next-steps-panel__item-header">
                    <strong>{task.label}</strong>
                    <span className="status-pill" data-status={task.status.key}>
                      {task.status.label}
                    </span>
                  </div>
                  <p>{task.detail}</p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {activeTask ? (
        <div className="task-overlay" role="presentation">
          <div className="task-overlay__backdrop" onClick={closeOverlay} />
          <div className="task-overlay__panel" role="dialog" aria-modal="true" aria-labelledby="task-overlay-title">
            <div className="task-overlay__header">
              <div>
                <h3 id="task-overlay-title">{activeTask.label}</h3>
                <span className="status-pill" data-status={activeTask.status.key}>
                  {activeTask.status.label}
                </span>
              </div>
              <button
                type="button"
                className="task-overlay__close"
                aria-label="Close instructions"
                onClick={closeOverlay}
              >
                ×
              </button>
            </div>
            <p className="task-overlay__detail">{overlayDescription}</p>
            <p className="task-overlay__cta">
              Need more context? <Link href={optimizationHref ?? '#'}>View the full optimization roadmap ↗</Link>
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
