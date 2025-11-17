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

function sanitizeTelephone(number) {
  if (typeof number !== 'string') {
    return null;
  }

  const trimmed = number.trim();

  if (!trimmed) {
    return null;
  }

  const digits = trimmed.replace(/[^+\d]/g, '');

  return digits ? digits : null;
}

function ProfilePreview({ preview }) {
  if (!preview) {
    return null;
  }

  const primaryPhoto =
    preview.coverPhoto ?? (Array.isArray(preview.photos) && preview.photos.length ? preview.photos[0] : null);
  const categories = Array.isArray(preview.categories) ? preview.categories.filter(Boolean) : [];
  const secondaryCategories = categories.filter(
    (category) => category && category !== preview.primaryCategory
  );
  const services = Array.isArray(preview.serviceCapabilities)
    ? preview.serviceCapabilities.filter(Boolean)
    : [];
  const hours = Array.isArray(preview.weekdayText) ? preview.weekdayText : [];
  const latestReview = preview.latestReview ?? null;

  const hasRating = Number.isFinite(preview.rating);
  const hasReviewCount = Number.isFinite(preview.reviewCount);
  const telHref = sanitizeTelephone(preview.phoneNumber);
  const firstHour = hours.length ? hours[0] : null;
  const profileInitial = preview.name ? preview.name.trim().charAt(0).toUpperCase() : 'G';

  return (
    <aside
      className="business-optimization-roadmap__profile-preview"
      aria-label="Google Business Profile preview"
    >
      <div className="business-optimization-roadmap__profile-top">
        <div className="business-optimization-roadmap__profile-avatar">
          {primaryPhoto ? (
            <img
              src={primaryPhoto}
              alt={`${preview.name ?? 'Business'} profile photo`}
              loading="lazy"
            />
          ) : (
            <span className="business-optimization-roadmap__profile-avatar-fallback" aria-hidden="true">
              {profileInitial}
            </span>
          )}
        </div>
        <div className="business-optimization-roadmap__profile-top-details">
          <h3 className="business-optimization-roadmap__profile-name">
            {preview.name ?? 'Google Business Profile'}
          </h3>
          {preview.primaryCategory || secondaryCategories.length ? (
            <p className="business-optimization-roadmap__profile-category">
              {[preview.primaryCategory, ...secondaryCategories.slice(0, 2)]
                .filter(Boolean)
                .join(' · ')}
            </p>
          ) : null}
          {hasRating || hasReviewCount ? (
            <div className="business-optimization-roadmap__profile-rating" aria-label="Google rating">
              {hasRating ? (
                <span className="business-optimization-roadmap__profile-rating-value">
                  ★ {preview.rating % 1 === 0 ? preview.rating.toFixed(0) : preview.rating.toFixed(1)}
                </span>
              ) : null}
              {hasReviewCount ? (
                <span className="business-optimization-roadmap__profile-review-count">
                  {preview.reviewCount} review{preview.reviewCount === 1 ? '' : 's'}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <dl className="business-optimization-roadmap__profile-info">
        {preview.address ? (
          <div className="business-optimization-roadmap__profile-info-item">
            <dt>Address</dt>
            <dd>{preview.address}</dd>
          </div>
        ) : null}
        {preview.phoneNumber ? (
          <div className="business-optimization-roadmap__profile-info-item">
            <dt>Phone</dt>
            <dd>
              {telHref ? <a href={`tel:${telHref}`}>{preview.phoneNumber}</a> : preview.phoneNumber}
            </dd>
          </div>
        ) : null}
        {preview.website ? (
          <div className="business-optimization-roadmap__profile-info-item">
            <dt>Website</dt>
            <dd>
              <a href={preview.website} target="_blank" rel="noopener noreferrer">
                {preview.website}
              </a>
            </dd>
          </div>
        ) : null}
        {firstHour ? (
          <div className="business-optimization-roadmap__profile-info-item">
            <dt>Hours</dt>
            <dd>{firstHour}</dd>
          </div>
        ) : null}
      </dl>

      {services.length ? (
        <div className="business-optimization-roadmap__profile-chip-list">
          {services.slice(0, 4).map((service) => (
            <span key={service} className="business-optimization-roadmap__profile-chip">
              {service}
            </span>
          ))}
          {services.length > 4 ? (
            <span className="business-optimization-roadmap__profile-chip business-optimization-roadmap__profile-chip--muted">
              +{services.length - 4} more
            </span>
          ) : null}
        </div>
      ) : null}

      {preview.description ? (
        <div className="business-optimization-roadmap__profile-review-snippet">
          <div className="business-optimization-roadmap__profile-review-snippet-header">
            <p className="business-optimization-roadmap__profile-review-author">Description</p>
          </div>
          <p className="business-optimization-roadmap__profile-review-snippet-body">{preview.description}</p>
        </div>
      ) : null}
    </aside>
  );
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
  const hasSections = sections.length > 0;

  return (
    <div className="surface-card surface-card--muted">
      <div
        className={`business-optimization-roadmap__overview${
          roadmap.profilePreview ? ' business-optimization-roadmap__overview--with-profile' : ''
        }`}
      >
        <div className="business-optimization-roadmap__overview-main">

          <div
            className={`business-optimization-roadmap__sections-summary ${
              hasSections
                ? 'business-optimization-roadmap__sections-summary--with-sections'
                : 'business-optimization-roadmap__sections-summary--without-sections'
            }`}
          >
            <div className="business-optimization-roadmap__summary-header">
              <strong className="business-optimization-roadmap__summary-heading">Optimization progress</strong>
              <span className="business-optimization-roadmap__summary-progress">{roadmap.progressPercent}% complete</span>
            </div>
            <div aria-hidden="true" className="business-optimization-roadmap__progress-track">
              <div
                className="business-optimization-roadmap__progress-fill"
                style={{ width: `${Math.min(100, Math.max(0, roadmap.progressPercent))}%` }}
              />
            </div>
          </div>
                    
          {hasSections ? (
            <div className="business-optimization-roadmap__section-summary-grid">
              {sections.map((section) => (
                <div key={section.id} className="business-optimization-roadmap__section-summary-card">
                  <span className="business-optimization-roadmap__section-summary-card-title">
                    {section.title}
                  </span>
                  <strong className="business-optimization-roadmap__section-summary-card-completion">
                    {section.completion === null ? 'No score yet' : `${section.completion}% complete`}
                  </strong>
                </div>
              ))}
            </div>
          ) : null}

        </div>

        {roadmap.profilePreview ? <ProfilePreview preview={roadmap.profilePreview} /> : null}
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
                <strong className="business-optimization-roadmap__section-completion">
                  {section.completion === null ? 'No score yet' : `${section.completion}% complete`}
                </strong>
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
