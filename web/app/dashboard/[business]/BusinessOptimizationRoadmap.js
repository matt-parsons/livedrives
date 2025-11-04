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

  const thumbnails = Array.isArray(preview.photos)
    ? preview.photos.filter((url) => url !== preview.coverPhoto).slice(0, 4)
    : [];

  const hasRating = Number.isFinite(preview.rating);
  const hasReviewCount = Number.isFinite(preview.reviewCount);
  const telHref = sanitizeTelephone(preview.phoneNumber);
  const categories = Array.isArray(preview.categories) ? preview.categories : [];
  const services = Array.isArray(preview.serviceCapabilities) ? preview.serviceCapabilities : [];
  const hours = Array.isArray(preview.weekdayText) ? preview.weekdayText : [];
  const latestReview = preview.latestReview ?? null;
  const latestPost = preview.latestPost ?? null;
  const postsCount = Array.isArray(preview.posts) ? preview.posts.length : 0;

  return (
    <div className="business-optimization-roadmap__profile-preview">
      <div className="business-optimization-roadmap__profile-media">
        <div className="business-optimization-roadmap__profile-cover">
          {preview.coverPhoto ? (
            <img
              src={preview.coverPhoto}
              alt={`${preview.name ?? 'Business'} cover photo`}
              loading="lazy"
            />
          ) : (
            <div className="business-optimization-roadmap__profile-cover-placeholder">
              <span>No photos yet</span>
            </div>
          )}
        </div>
        {thumbnails.length ? (
          <div className="business-optimization-roadmap__profile-thumbnails" role="list">
            {thumbnails.map((url, index) => (
              <div
                key={`${url}-${index}`}
                className="business-optimization-roadmap__profile-thumbnail"
                role="listitem"
              >
                <img
                  src={url}
                  alt={`${preview.name ?? 'Business'} photo ${index + 2}`}
                  loading="lazy"
                />
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="business-optimization-roadmap__profile-details">
        <div className="business-optimization-roadmap__profile-header">
          <h3 className="business-optimization-roadmap__profile-name">
            {preview.name ?? 'Google Business Profile'}
          </h3>
          <div className="business-optimization-roadmap__profile-flags">
            {preview.primaryCategory ? (
              <span className="business-optimization-roadmap__profile-category">{preview.primaryCategory}</span>
            ) : null}
            {preview.businessStatus ? (
              <span className="business-optimization-roadmap__profile-status">{preview.businessStatus}</span>
            ) : null}
          </div>
        </div>

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

        <p
          className={`business-optimization-roadmap__profile-description${
            preview.description ? '' : ' business-optimization-roadmap__profile-description--muted'
          }`}
        >
          {preview.description ?? 'No description published yet.'}
        </p>

        <dl className="business-optimization-roadmap__profile-meta">
          {preview.address ? (
            <div className="business-optimization-roadmap__profile-meta-item">
              <dt>Address</dt>
              <dd>{preview.address}</dd>
            </div>
          ) : null}
          {preview.phoneNumber ? (
            <div className="business-optimization-roadmap__profile-meta-item">
              <dt>Phone</dt>
              <dd>
                {telHref ? (
                  <a href={`tel:${telHref}`}>{preview.phoneNumber}</a>
                ) : (
                  preview.phoneNumber
                )}
              </dd>
            </div>
          ) : null}
          {preview.website ? (
            <div className="business-optimization-roadmap__profile-meta-item">
              <dt>Website</dt>
              <dd>
                <a href={preview.website} target="_blank" rel="noopener noreferrer">
                  {preview.website}
                </a>
              </dd>
            </div>
          ) : null}
          {preview.businessStatus ? (
            <div className="business-optimization-roadmap__profile-meta-item">
              <dt>Status</dt>
              <dd>{preview.businessStatus}</dd>
            </div>
          ) : null}
          {preview.timezone ? (
            <div className="business-optimization-roadmap__profile-meta-item">
              <dt>Timezone</dt>
              <dd>{preview.timezone}</dd>
            </div>
          ) : null}
          {preview.placeId ? (
            <div className="business-optimization-roadmap__profile-meta-item">
              <dt>Place ID</dt>
              <dd>
                <code>{preview.placeId}</code>
              </dd>
            </div>
          ) : null}
          {preview.cid ? (
            <div className="business-optimization-roadmap__profile-meta-item">
              <dt>CID</dt>
              <dd>
                <code>{preview.cid}</code>
              </dd>
            </div>
          ) : null}
        </dl>

        <div className="business-optimization-roadmap__profile-insights">
          <div className="business-optimization-roadmap__profile-detail-card">
            <h4 className="business-optimization-roadmap__profile-detail-title">Categories</h4>
            {categories.length ? (
              <div className="business-optimization-roadmap__profile-chip-list">
                {categories.map((category) => (
                  <span key={category} className="business-optimization-roadmap__profile-chip">
                    {category}
                  </span>
                ))}
              </div>
            ) : (
              <p className="business-optimization-roadmap__profile-detail-empty">
                No categories returned yet.
              </p>
            )}
          </div>

          <div className="business-optimization-roadmap__profile-detail-card">
            <h4 className="business-optimization-roadmap__profile-detail-title">Service capabilities</h4>
            {services.length ? (
              <div className="business-optimization-roadmap__profile-chip-list">
                {services.map((service) => (
                  <span key={service} className="business-optimization-roadmap__profile-chip">
                    {service}
                  </span>
                ))}
              </div>
            ) : (
              <p className="business-optimization-roadmap__profile-detail-empty">
                No services detected from Google Places.
              </p>
            )}
          </div>

          <div className="business-optimization-roadmap__profile-detail-card">
            <h4 className="business-optimization-roadmap__profile-detail-title">Business hours</h4>
            {hours.length ? (
              <ul className="business-optimization-roadmap__profile-hours">
                {hours.map((entry) => (
                  <li key={entry}>{entry}</li>
                ))}
              </ul>
            ) : (
              <p className="business-optimization-roadmap__profile-detail-empty">
                Hours not published yet.
              </p>
            )}
          </div>

          <div className="business-optimization-roadmap__profile-detail-card">
            <h4 className="business-optimization-roadmap__profile-detail-title">Google posts</h4>
            {latestPost ? (
              <p className="business-optimization-roadmap__profile-detail-body">
                Last detected on {latestPost.formatted}
                {latestPost.relative ? ` (${latestPost.relative})` : ''}.
              </p>
            ) : (
              <p className="business-optimization-roadmap__profile-detail-empty">
                No Google posts detected yet.
              </p>
            )}
            <p className="business-optimization-roadmap__profile-detail-footnote">
              {postsCount} post{postsCount === 1 ? '' : 's'} linked from sidebar scrape.
            </p>
          </div>

          <div className="business-optimization-roadmap__profile-detail-card business-optimization-roadmap__profile-detail-card--review">
            <h4 className="business-optimization-roadmap__profile-detail-title">Latest Google review</h4>
            {latestReview ? (
              <div className="business-optimization-roadmap__profile-review">
                {latestReview.profilePhotoUrl ? (
                  <img
                    src={latestReview.profilePhotoUrl}
                    alt={`${latestReview.authorName ?? 'Reviewer'} avatar`}
                    className="business-optimization-roadmap__profile-review-avatar"
                    loading="lazy"
                  />
                ) : null}
                <div className="business-optimization-roadmap__profile-review-body">
                  <div className="business-optimization-roadmap__profile-review-header">
                    <div>
                      {latestReview.authorUrl ? (
                        <a
                          href={latestReview.authorUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="business-optimization-roadmap__profile-review-author"
                        >
                          {latestReview.authorName ?? 'Google user'}
                        </a>
                      ) : (
                        <span className="business-optimization-roadmap__profile-review-author">
                          {latestReview.authorName ?? 'Google user'}
                        </span>
                      )}
                      <div className="business-optimization-roadmap__profile-review-meta">
                        {latestReview.postedAt ? <span>{latestReview.postedAt}</span> : null}
                        {latestReview.relativeTimeDescription ? (
                          <span>{latestReview.relativeTimeDescription}</span>
                        ) : null}
                      </div>
                    </div>
                    {Number.isFinite(latestReview.rating) ? (
                      <span className="business-optimization-roadmap__profile-review-rating">
                        ★{' '}
                        {latestReview.rating % 1 === 0
                          ? latestReview.rating.toFixed(0)
                          : latestReview.rating.toFixed(1)}
                      </span>
                    ) : null}
                  </div>
                  {latestReview.text ? (
                    <p className="business-optimization-roadmap__profile-review-text">{latestReview.text}</p>
                  ) : null}
                  {latestReview.translated ? (
                    <p className="business-optimization-roadmap__profile-review-footnote">
                      Translated from {latestReview.originalLanguage ?? latestReview.language ?? 'another language'}.
                    </p>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="business-optimization-roadmap__profile-detail-empty">
                No recent reviews detected yet.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
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

      <ProfilePreview preview={roadmap.profilePreview} />

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
