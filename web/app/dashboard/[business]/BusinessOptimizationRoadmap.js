'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image'

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
            <Image
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

const CHECKLIST_SYMBOLS = {
  completed: '✓',
  pending: '✕',
  in_progress: '✕',
  unknown: '✕'
};

function RoadmapChecklist({ tasks }) {
  if (!tasks?.length) {
    return null;
  }

  return (
    <ul className="business-optimization-roadmap__checklist">
      {tasks.map((task) => {
        const statusKey = task.status?.key ?? 'unknown';
        const symbol = CHECKLIST_SYMBOLS[statusKey] ?? '';
        const iconClassName = [
          'business-optimization-roadmap__checklist-icon',
          `business-optimization-roadmap__checklist-icon--${statusKey}`
        ].join(' ');

        return (
          <li key={task.id} className="business-optimization-roadmap__checklist-item">
            <span className={iconClassName} aria-hidden="true">
              {symbol}
            </span>
            <div className="business-optimization-roadmap__checklist-info">
              <div className="business-optimization-roadmap__checklist-meta">
                <span className="business-optimization-roadmap__checklist-title">{task.label}</span>
                {task.status ? (
                  <span className="status-pill" data-status={statusKey}>
                    {task.status.label}
                  </span>
                ) : null}
              </div>
              {task.detail ? (
                <p className="business-optimization-roadmap__checklist-detail">{task.detail}</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default function BusinessOptimizationRoadmap({ roadmap, error, placeId, editHref }) {
  const [expandedSectionIds, setExpandedSectionIds] = useState([]);
  const toggleSectionExpansion = (sectionId) => {
    setExpandedSectionIds((previous) =>
      previous.includes(sectionId)
        ? previous.filter((id) => id !== sectionId)
        : [...previous, sectionId]
    );
  };

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
          <div className="business-optimization-roadmap__summary-header">
            <strong className="business-optimization-roadmap__summary-heading">Optimization progress</strong>
            <strong className="business-optimization-roadmap__summary-progress">{roadmap.progressPercent}%</strong>
          </div>
          <div aria-hidden="true" className="business-optimization-roadmap__progress-track">
            <div
              className="business-optimization-roadmap__progress-fill"
              style={{ width: `${Math.min(100, Math.max(0, roadmap.progressPercent))}%` }}
            />
          </div>

          {hasSections ? (
            <div className="business-optimization-roadmap__section-list-wrapper">
              {sections.map((section) => {
                const isExpanded = expandedSectionIds.includes(section.id);
                const completionLabel =
                  section.completion === null ? 'No score yet' : `${section.completion}%`;

                return (
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
                          {completionLabel}
                        </strong>
                      </div>
                    </div>
                    <div className="business-optimization-roadmap__section-toggle-row">
                      <button
                        type="button"
                        className="business-optimization-roadmap__section-toggle-link"
                        onClick={() => toggleSectionExpansion(section.id)}
                        aria-expanded={isExpanded}
                        aria-controls={`section-${section.id}-tasks`}
                      >
                        <span>{isExpanded ? 'Hide checklist' : 'View checklist'}</span>
                        <span aria-hidden="true" className="business-optimization-roadmap__section-toggle-icon">
                          {isExpanded ? '▲' : '▼'}
                        </span>
                      </button>
                    </div>

                    {section.tasks.length ? (
                      <div
                        id={`section-${section.id}-tasks`}
                        className="business-optimization-roadmap__section-checklist"
                      >
                        {isExpanded ? <RoadmapChecklist tasks={section.tasks} /> : null}
                      </div>
                    ) : (
                      <p className="business-optimization-roadmap__section-empty-message">
                        No tasks mapped to this section yet.
                      </p>
                    )}
                  </section>
                );
              })}
            </div>
          ) : null}
        </div>

        {roadmap.profilePreview ? <ProfilePreview preview={roadmap.profilePreview} /> : null}
      </div>
    </div>
  );
}
