import Link from 'next/link';

import styles from './BusinessOptimizationRoadmap.module.css';

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
    <li key={task.id} className={styles.taskCard}>
      <div className={styles.taskCardHeader}>
        <div className={styles.taskInfo}>
          <strong className={styles.taskTitle}>{task.label}</strong>
          {task.detail ? <p className={styles.taskDetail}>{task.detail}</p> : null}
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
        <p className={styles.connectMessage}>
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
        <div className={styles.sectionSummaryGrid}>
          {sections.map((section) => (
            <div key={section.id} className={styles.sectionSummaryCard}>
              <span className={styles.sectionSummaryCardTitle}>
                {section.title}
              </span>
              <strong className={styles.sectionSummaryCardGrade}>{section.grade ?? '—'}</strong>
              <span className={styles.sectionSummaryCardCompletion}>
                {section.completion === null ? 'No score yet' : `${section.completion}% complete`}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      <div
        className={`${styles.sectionsSummary} ${
          sections.length ? styles.sectionsSummaryWithSections : styles.sectionsSummaryWithoutSections
        }`}
      >
        <div className={styles.summaryHeader}>
          <strong className={styles.summaryHeading}>Optimization readiness</strong>
          <span className={styles.summaryProgress}>{roadmap.progressPercent}% complete</span>
        </div>
        <div
          aria-hidden="true"
          className={styles.progressTrack}
        >
          <div
            className={styles.progressFill}
            style={{ width: `${Math.min(100, Math.max(0, roadmap.progressPercent))}%` }}
          />
        </div>
      </div>

      <div className={styles.sectionListWrapper}>
        {sections.map((section) => (
          <section key={section.id} className={styles.sectionItem}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionInfo}>
                <h3 className={styles.sectionHeading}>{section.title}</h3>
                {section.description ? (
                  <p className={styles.sectionDescription}>{section.description}</p>
                ) : null}
              </div>
              <div className={styles.sectionScore}>
                <strong className={styles.sectionScoreValue}>{section.grade ?? '—'}</strong>
                <div className={styles.sectionCompletion}>
                  {section.completion === null ? 'No score yet' : `${section.completion}% complete`}
                </div>
              </div>
            </div>

            {section.tasks.length ? (
              <ul className={styles.sectionTaskList}>
                {section.tasks.map((task) => (
                  <RoadmapTaskCard key={task.id} task={task} />
                ))}
              </ul>
            ) : (
              <p className={styles.sectionEmptyMessage}>
                No tasks mapped to this section yet.
              </p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
