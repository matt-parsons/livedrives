import Link from 'next/link';

function formatImpact(weight) {
  if (weight === null || weight === undefined) {
    return null;
  }

  const value = Number(weight);

  if (!Number.isFinite(value)) {
    return null;
  }

  return `${value}% impact`;
}

function RoadmapTaskCard({ task }) {
  const impactLabel = formatImpact(task.weight);

  return (
    <li
      key={task.id}
      style={{
        listStyle: 'none',
        padding: '1rem 1.1rem',
        borderRadius: '12px',
        border: '1px solid rgba(3, 60, 87, 0.12)',
        background: '#fff',
        boxShadow: '0 6px 12px rgba(3, 60, 87, 0.06)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.65rem'
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '1rem'
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <strong style={{ fontSize: '1.02rem', color: 'var(--color-heading)' }}>{task.label}</strong>
          {task.detail ? (
            <p
              style={{
                margin: 0,
                fontSize: '0.9rem',
                color: 'rgba(3, 60, 87, 0.66)',
                lineHeight: 1.4
              }}
            >
              {task.detail}
            </p>
          ) : null}
        </div>
        <span className="status-pill" data-status={task.status.key}>
          {task.status.label}
        </span>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.85rem',
          color: 'rgba(3, 60, 87, 0.66)'
        }}
      >
        {task.auto ? (
          <span>Automatically scored</span>
        ) : (
          <span>Manual follow-up</span>
        )}
        {impactLabel ? <strong style={{ color: 'var(--color-primary-strong)' }}>{impactLabel}</strong> : null}
      </div>
    </li>
  );
}

export default function BusinessOptimizationRoadmap({ roadmap, error, placeId, editHref }) {
  if (!placeId) {
    return (
      <div className="surface-card surface-card--muted surface-card--compact">
        <div className="section-header">
          <div>
            <h2 className="section-title">Optimization roadmap</h2>
            <p className="section-caption">Connect a Google Place ID to unlock optimization guidance.</p>
          </div>
          <Link className="cta-link" href={editHref ?? 'edit'}>
            Add Google Place ID
          </Link>
        </div>
        <p style={{ marginTop: '0.75rem', color: 'rgba(3, 60, 87, 0.66)', fontSize: '0.9rem' }}>
          This business is not linked to Google Places yet. Once a Place ID is connected we can evaluate the
          profile’s completeness.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="surface-card surface-card--muted surface-card--compact">
        <div className="section-header">
          <div>
            <h2 className="section-title">Optimization roadmap</h2>
            <p className="section-caption">We hit an issue loading Google profile insights.</p>
          </div>
        </div>
        <div className="inline-error" role="status">
          <strong>Unable to contact Google Places</strong>
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (!roadmap) {
    return null;
  }

  const autoTasks = roadmap.tasks.filter((task) => task.auto);
  const manualTasks = roadmap.tasks.filter((task) => !task.auto);

  return (
    <div className="surface-card surface-card--muted">
      <div className="section-header">
        <div>
          <h2 className="section-title">Optimization roadmap</h2>
          <p className="section-caption">
            We analyse Google Places data to prioritize the biggest profile wins.
          </p>
        </div>
        {roadmap.place?.googleMapsUri ? (
          <a
            className="cta-link"
            href={roadmap.place.googleMapsUri}
            target="_blank"
            rel="noopener noreferrer"
          >
            View on Google Maps ↗
          </a>
        ) : null}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <strong style={{ fontSize: '1.1rem', color: 'var(--color-heading)' }}>Optimization readiness</strong>
          <span style={{ fontSize: '0.9rem', color: 'rgba(3, 60, 87, 0.6)' }}>{roadmap.progressPercent}% complete</span>
        </div>
        <div
          aria-hidden="true"
          style={{
            position: 'relative',
            width: '100%',
            height: '12px',
            borderRadius: '999px',
            background: 'rgba(3, 60, 87, 0.15)',
            overflow: 'hidden'
          }}
        >
          <div
            style={{
              width: `${Math.min(100, Math.max(0, roadmap.progressPercent))}%`,
              height: '100%',
              borderRadius: '999px',
              background: 'linear-gradient(90deg, #fe8833, #d06f29)'
            }}
          />
        </div>
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'rgba(3, 60, 87, 0.66)' }}>
          Automated checks cover {roadmap.automatedWeight}% of the roadmap. Manual follow-ups account for the
          remaining {roadmap.manualWeight}%.
        </p>
      </div>

      <div
        style={{
          marginTop: '1.25rem',
          display: 'grid',
          gap: '1rem',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))'
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--color-heading)' }}>Automated insights</h3>
          {autoTasks.length ? (
            <ul style={{ margin: 0, padding: 0, display: 'grid', gap: '0.75rem' }}>
              {autoTasks.map((task) => (
                <RoadmapTaskCard key={task.id} task={task} />
              ))}
            </ul>
          ) : (
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'rgba(3, 60, 87, 0.66)' }}>
              No automated signals detected. Double-check that the Place ID is correct and try again.
            </p>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--color-heading)' }}>Manual priorities</h3>
          {manualTasks.length ? (
            <ul style={{ margin: 0, padding: 0, display: 'grid', gap: '0.75rem' }}>
              {manualTasks.map((task) => (
                <RoadmapTaskCard key={task.id} task={task} />
              ))}
            </ul>
          ) : (
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'rgba(3, 60, 87, 0.66)' }}>
              Nothing to follow up manually right now.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
