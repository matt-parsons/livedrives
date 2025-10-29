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
    <li key={task.id} className="business-optimization-roadmap__task-card">
      <div className="business-optimization-roadmap__task-card-header">
        <div className="business-optimization-roadmap__task-info">
          <strong className="business-optimization-roadmap__task-title">{task.label}</strong>
          {task.detail ? <p className="business-optimization-roadmap__task-detail">{task.detail}</p> : null}
        </div>
        <span className="status-pill" data-status={task.status.key}>
          {task.status.label}
        </span>
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
        <p className="business-optimization-roadmap__connect-message">
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

  const sections = Array.isArray(roadmap.sections) ? roadmap.sections : [];

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

      {sections.length ? (
        <div className="business-optimization-roadmap__section-summary-grid">
          {sections.map((section) => (
            <div key={section.id} className="business-optimization-roadmap__section-summary-card">
              <span className="business-optimization-roadmap__section-summary-card-title">
                {section.title}
              </span>
              <strong className="business-optimization-roadmap__section-summary-card-grade">{section.grade ?? '—'}</strong>
              <span className="business-optimization-roadmap__section-summary-card-completion">
                {section.completion === null ? 'No score yet' : `${section.completion}% complete`}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      <div
        className={`business-optimization-roadmap__sections-summary ${
          sections.length
            ? 'business-optimization-roadmap__sections-summary--with-sections'
            : 'business-optimization-roadmap__sections-summary--without-sections'
        }`}
      >
        <div className="business-optimization-roadmap__summary-header">
          <strong className="business-optimization-roadmap__summary-heading">Optimization readiness</strong>
          <span className="business-optimization-roadmap__summary-progress">{roadmap.progressPercent}% complete</span>
        </div>
        <div
          aria-hidden="true"
          className="business-optimization-roadmap__progress-track"
        >
          <div
            className="business-optimization-roadmap__progress-fill"
            style={{ width: `${Math.min(100, Math.max(0, roadmap.progressPercent))}%` }}
          />
        </div>
      </div>

      <div className="business-optimization-roadmap__section-list-wrapper">
        {sections.map((section) => (
          <section key={section.id} className="business-optimization-roadmap__section-item">
            <div className="business-optimization-roadmap__section-header">
              <div className="business-optimization-roadmap__section-info">
                <h3 className="business-optimization-roadmap__section-heading">{section.title}</h3>
                {section.description ? (
                  <p className="business-optimization-roadmap__section-description">{section.description}</p>
                ) : null}
              </div>
              <div className="business-optimization-roadmap__section-score">
                <strong className="business-optimization-roadmap__section-score-value">{section.grade ?? '—'}</strong>
                <div className="business-optimization-roadmap__section-completion">
                  {section.completion === null ? 'No score yet' : `${section.completion}% complete`}
                </div>
              </div>
            </div>

            {section.tasks.length ? (
              <ul className="business-optimization-roadmap__section-task-list">
                {section.tasks.map((task) => (
                  <RoadmapTaskCard key={task.id} task={task} />
                ))}
              </ul>
            ) : (
              <p className="business-optimization-roadmap__section-empty-message">
                No tasks mapped to this section yet.
              </p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
