'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import { resolveLetterGrade } from './optimization';

function selectNextOptimizationSteps(roadmap, limit = 3) {
  if (!roadmap || !Array.isArray(roadmap.tasks)) {
    return [];
  }

  return roadmap.tasks
    .filter((task) => task.status && task.status.key !== 'completed')
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
    .slice(0, limit);
}

export default function OptimizationPanelsClient({
  placeId,
  optimizationHref,
  canManageSettings,
  editHref
}) {
  const [loading, setLoading] = useState(Boolean(placeId));
  const [error, setError] = useState(null);
  const [roadmap, setRoadmap] = useState(null);

  useEffect(() => {
    if (!placeId) {
      setLoading(false);
      setError(null);
      setRoadmap(null);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);
    setRoadmap(null);

    const controller = new AbortController();
    const fetchData = async () => {
      try {
        const response = await fetch(`/api/optimization-data?placeId=${encodeURIComponent(placeId)}`, {
          method: 'GET',
          signal: controller.signal,
          cache: 'no-store'
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || `Request failed with status ${response.status}`);
        }

        const payload = await response.json();
        if (isMounted) {
          setRoadmap(payload?.data?.roadmap ?? null);
          setError(null);
        }
      } catch (err) {
        if (!controller.signal.aborted && isMounted) {
          setError(err.message || 'Failed to load optimization data.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [placeId]);

  if (!placeId) {
    return (
      <>
        <section className="section">
          <div className="surface-card surface-card--muted surface-card--compact">
            <div className="section-header">
              <div>
                <h2 className="section-title">Next steps to optimize</h2>
                <p className="section-caption">
                  Focus on these tasks to strengthen your local visibility.
                </p>
              </div>
              <Link className="cta-link" href={optimizationHref}>
                Explore full roadmap ↗
              </Link>
            </div>

            <p style={{ marginTop: '0.75rem', color: '#6b7280' }}>
              Connect your Google Business Profile to unlock personalized recommendations.
            </p>
          </div>
        </section>

        <section className="section">
          <div className="surface-card surface-card--muted">
            <div className="section-header">
              <div>
                <h2 className="section-title">GBP optimization</h2>
                <p className="section-caption">
                  Gauge how complete your Google Business Profile looks today.
                </p>
              </div>
              <Link className="cta-link" href={optimizationHref}>
                View full checklist ↗
              </Link>
            </div>

            <div style={{ marginTop: '0.75rem' }}>
              <p style={{ color: '#6b7280', marginBottom: '0.75rem' }}>
                Connect a Google Place ID to unlock automated profile scoring and guidance.
              </p>
              {canManageSettings ? (
                <Link className="cta-link" href={editHref}>
                  Add Google Place ID ↗
                </Link>
              ) : null}
            </div>
          </div>
        </section>
      </>
    );
  }

  const optimizationGrade = roadmap ? resolveLetterGrade(roadmap.progressPercent) : null;
  const optimizationSteps = selectNextOptimizationSteps(roadmap);

  return (
    <>

      <section className="section">
        <div className="surface-card surface-card--muted">
          <div className="section-header">
            <div>
              <h2 className="section-title">GBP optimization</h2>
              <p className="section-caption">
                Gauge how complete your Google Business Profile looks today.
              </p>
            </div>
          </div>

          {loading ? (
            <p style={{ marginTop: '0.75rem', color: '#6b7280' }}>
              Gathering data… check back in a moment.
            </p>
          ) : error ? (
            <div className="inline-error" role="status" style={{ marginTop: '0.75rem' }}>
              <strong>Unable to contact Google Places</strong>
              <span>{error}</span>
            </div>
          ) : roadmap ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.85rem',
                marginTop: '0.75rem'
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '1.5rem',
                  alignItems: 'center'
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>Overall grade</span>
                  <strong style={{ fontSize: '2rem', color: 'var(--color-heading)' }}>
                    {optimizationGrade ?? '—'}
                  </strong>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>Automated readiness</span>
                  <strong style={{ fontSize: '1.4rem', color: 'var(--color-heading)' }}>
                    {roadmap.progressPercent}% complete
                  </strong>
                </div>
              </div>

              <div
                style={{
                  height: '0.65rem',
                  borderRadius: '999px',
                  background: 'rgba(3, 60, 87, 0.12)',
                  overflow: 'hidden'
                }}
                role="presentation"
              >
                <div
                  style={{
                    width: `${Math.min(100, Math.max(0, roadmap.progressPercent))}%`,
                    background: 'var(--color-primary)',
                    height: '100%'
                  }}
                />
              </div>
            </div>
          ) : (
            <p style={{ marginTop: '0.75rem', color: '#6b7280' }}>
              We could not compute optimization insights for this profile yet.
            </p>
          )}
        </div>
      </section>    
      <section className="section">
        <div className="surface-card surface-card--muted surface-card--compact">
          <div className="section-header">
            <div>
              <h2 className="section-title">Next steps to optimize</h2>
              <p className="section-caption">
                Focus on these tasks to strengthen your local visibility.
              </p>
            </div>
            <Link className="cta-link" href={optimizationHref}>
              Explore full roadmap ↗
            </Link>
          </div>

          {loading ? (
            <div
              style={{
                marginTop: '0.75rem',
                padding: '0.85rem 1rem',
                borderRadius: '12px',
                background: 'rgba(3, 60, 87, 0.08)',
                color: 'rgba(3, 60, 87, 0.8)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <span>Gathering Google profile data…</span>
              <span className="status-pill" data-status="in_progress">
                Loading
              </span>
            </div>
          ) : error ? (
            <div className="inline-error" role="status" style={{ marginTop: '0.75rem' }}>
              <strong>Unable to contact Google Places</strong>
              <span>{error}</span>
            </div>
          ) : roadmap && optimizationSteps.length ? (
            <ul
              style={{
                listStyle: 'none',
                display: 'grid',
                gap: '0.75rem',
                margin: '0.75rem 0 0',
                padding: 0
              }}
            >
              {optimizationSteps.map((task) => (
                <li
                  key={task.id}
                  style={{
                    border: '1px solid rgba(3, 60, 87, 0.12)',
                    borderRadius: '12px',
                    padding: '0.85rem 1rem',
                    background: '#fff',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.4rem'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                    <strong style={{ fontSize: '1.05rem', color: 'var(--color-heading)' }}>
                      {task.label}
                    </strong>
                    <span className="status-pill" data-status={task.status.key}>
                      {task.status.label}
                    </span>
                  </div>
                  <p style={{ margin: 0, color: 'rgba(3, 60, 87, 0.66)', fontSize: '0.9rem' }}>
                    {task.detail}
                  </p>
                </li>
              ))}
            </ul>
          ) : roadmap ? (
            <p style={{ marginTop: '0.75rem', color: '#6b7280' }}>
              Great work! Automated checks did not surface additional actions right now.
            </p>
          ) : (
            <p style={{ marginTop: '0.75rem', color: '#6b7280' }}>
              We could not compute optimization insights for this profile yet.
            </p>
          )}
        </div>
      </section>

    </>
  );
}
