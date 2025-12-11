'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

const BASE_NAVIGATION_STEPS = [
  'Visit https://business.google.com/locations and sign in with the owner or manager account for this listing.',
  'Select the correct location from the list of profiles or use the search bar to filter by name and address.',
  'In the “See your profile” panel, choose “Edit profile” so the Google Business Profile editor opens on the right side of the screen.'
];

const TASK_GUIDES = {
  default: {
    summary:
      'Use the Google Business Profile editor to update this information. Completing the module keeps your listing trusted and eligible for visibility boosts.',
    entrySteps: BASE_NAVIGATION_STEPS,
    steps: [
      'Follow the prompts in the Google Business Profile editor related to this module and complete every requested field.',
      'Save your changes, confirm that Google accepted them, and repeat the process for any other flagged items.'
    ],
    tips: [
      'If a change is rejected, review Google’s content policies and resubmit.',
      'Document your update with screenshots so you can prove completion to teammates or clients.'
    ],
    resources: [
      {
        label: 'Google Business Profile basics',
        href: 'https://support.google.com/business/answer/6332844'
      }
    ]
  },
  'claim-profile': {
    summary:
      'Google still considers this location unverified. Claiming and verifying the profile unlocks every other optimization task.',
    steps: [
      'In the “Your business on Google” card, choose “Claim this business” or “Verify now.”',
      'Select the verification method Google offers (phone, email, postcard, live video, or video recording).',
      'Capture and upload any proof Google requests, confirm your business details, and click “Submit.”'
    ],
    template: {
      id: 'claim-profile-template',
      title: 'Verification prep checklist',
      description: 'Fill in the blanks and copy this list into your support ticket or internal task manager.',
      text: `Legal business name:\nStorefront address:\nPrimary contact name:\nRole/title of contact:\nDirect phone number (for Google support):\nPublic-facing phone number:\nHours of operation:\nWebsite URL:\nDocumentation available (business license, utility bill, signage photos):`
    },
    tips: [
      'When possible, use the video verification option—it is usually the fastest path to approval.',
      'Upload current photos of your storefront signage before starting verification to build trust with the reviewer.'
    ],
    resources: [
      {
        label: 'Verification help center',
        href: 'https://support.google.com/business/answer/7107242'
      }
    ]
  },
  description: {
    summary:
      'Google allows up to 750 characters for your description. Use two to three keyword-rich sentences so prospects immediately understand what you do and where you operate.',
    steps: [
      'Within “Edit profile,” open the “Business information” tab and scroll to “Description.”',
      'Click the pencil icon, paste or type your refreshed copy (aim for 160–750 characters), and press “Save.”'
    ],
    template: {
      id: 'description-template',
      title: 'Suggested description structure',
      description: 'Customize the placeholders so the copy matches your brand voice before saving it in Google.',
      text: `[Business Name] is a [adjective] [primary service or category] serving [core audience] across [service area/neighborhood]. With [years] years of experience, we specialize in [top services] and back every project with [differentiator]. Visit us at [street/city] or call [phone number] to schedule [primary call-to-action].`
    },
    tips: [
      'Lead with your main keyword and primary service so the copy reinforces local relevance.',
      'Avoid sales-heavy language or claims you cannot verify—Google may reject it.'
    ],
    resources: [
      {
        label: 'Write a great business description',
        href: 'https://support.google.com/business/answer/7091'
      }
    ]
  },
  photos: {
    summary:
      'High-quality, current photos increase conversion rates and prove you are open. Upload at least 10 shots covering the storefront, team, and recent work.',
    steps: [
      'In the Google Business Profile editor, click “Add photo” in the “Photos” module.',
      'Choose the correct type (Exterior, Interior, Product, Team, or At work) and drag in your latest images (at least 720px wide).',
      'Add captions where possible and publish. Repeat monthly so Google sees ongoing activity.'
    ],
    template: {
      id: 'photo-shot-list',
      title: 'Shot list to capture',
      description: 'Use this as a checklist for your photographer or field staff.',
      text: `1. Street-facing exterior with signage and parking.\n2. Reception or primary interior service area.\n3. Team photo (posed or candid).\n4. Technicians or staff assisting a customer.\n5. Product or service close-up (before/after when applicable).\n6. Seasonal display or promotion.\n7. Vehicle fleet or branded equipment.\n8. Accessibility features (ramps, entrances).\n9. Safety/compliance photo (licenses, certifications).\n10. Community involvement or event participation.`
    },
    tips: [
      'Use horizontal images with good lighting and no heavy filters.',
      'Rename files with keywords (e.g., “denver-plumber-van.jpg”) before uploading for minor SEO gains.'
    ]
  },
  categories: {
    summary:
      'Precise categories help Google match you to the right searches. Keep one focused primary category and up to nine supporting secondary categories.',
    steps: [
      'In “Business information,” click “Business category.”',
      'Search for the closest matching primary category and apply it, then add the most relevant secondary categories that describe distinct services you actually offer.',
      'Remove outdated categories so Google does not confuse your listing.'
    ],
    template: {
      id: 'category-template',
      title: 'Category plan',
      description: 'Map out your category stack before editing the profile.',
      text: `Primary category: [ex. Painter]\nSecondary category 1: [ex. Contractor]\nSecondary category 2: [ex. Painting]\nSecondary category 3: [ex. Carpenter]\nCategories to remove: [list anything outdated]`
    },
    tips: [
      'Only use categories that describe your core services—adding unrelated ones can hurt rankings.',
      'Check the “People also search for” suggestions in Google Maps to find category inspiration.'
    ]
  },
  'update-posts': {
    summary:
      'Fresh posts signal that the business is active. Aim to publish at least one update each week with a clear call-to-action.',
    entrySteps: [
      'While signed in to your Google Business Profile account, search Google for your business name.',
      'In the management panel that appears, click “See your profile” if you are prompted.',
      'Locate the “Promote” card and choose “Add update” to open the posting composer.'
    ],
    steps: [
      'From the Google Business Profile home view, click “Add update” under the “Promote” card.',
      'Choose the update type (What’s new, Offer, Event), add 2–5 sentences, a CTA button, and a relevant image.',
      'Preview the post for typos, then click “Publish.”'
    ],
    template: {
      id: 'post-template',
      title: 'Weekly update template',
      description: 'Adjust the offer, date, or CTA before posting.',
      text: `Headline: [Service or offer name]\nBody: This week we’re helping [audience] with [service/outcome]. Book by [deadline] to receive [incentive].\nCTA button: [Call now / Book / Learn more]\nLink: [Landing page URL]\nPhoto/video: [File name or drive link]`
    },
    tips: [
      'Use events for time-bound promotions so Google shows start/end dates.',
      'Repurpose social media graphics to save time, but keep text easy to read on mobile.'
    ]
  },
  hours: {
    summary:
      'Accurate hours prevent negative reviews and lost leads. Update both regular and special hours.',
    steps: [
      'In “Edit profile,” open the “Hours” tab.',
      'Adjust the toggles for each day, enter open/close times, and click “Apply.”',
      'Add holiday or seasonal hours in the “More hours” section so Google can display special schedules.'
    ],
    template: {
      id: 'hours-template',
      title: 'Operating hours worksheet',
      description: 'Copy this grid, confirm it with the team, and paste into Google.',
      text: `Mon: [open] – [close]\nTue: [open] – [close]\nWed: [open] – [close]\nThu: [open] – [close]\nFri: [open] – [close]\nSat: [open] – [close or Closed]\nSun: [open] – [close or Closed]\nUpcoming special hours: [date + schedule]\nEmergency/after-hours contact: [phone or instructions]`
    },
    tips: [
      'If you run 24/7 service calls, still list your office hours and add “More hours” for emergency availability.',
      'Review hours quarterly or whenever staffing changes.'
    ]
  },
  'phone-number': {
    summary:
      'A public phone number is required so customers can reach you directly. Use a number that is answered during business hours.',
    steps: [
      'Inside “Business information,” scroll to “Contact details.”',
      'Click the pencil icon next to “Phone,” add your primary number (include country code), and optionally list an additional number for tracking.',
      'Verify the number by phone/SMS if Google prompts you.'
    ],
    template: {
      id: 'phone-template',
      title: 'Contact info block',
      description: 'Confirm this info internally before updating Google.',
      text: `Primary phone: [local number]\nBackup phone or call tracking line: [number]\nSMS capable?: [Yes/No]\nBest time to answer: [hours]\nTeam member responsible for calls: [name]\nNotes: [voicemail instructions, language support, etc.]`
    },
    tips: [
      'Avoid routing the primary number to an IVR tree longer than 2 steps—callers may hang up.',
      'Keep the number consistent with what you publish on your website and citations.'
    ]
  },
  website: {
    summary:
      'Linking to your website lets searchers research you further and strengthens NAP consistency.',
    steps: [
      'Open “Business information” → “Contact details.”',
      'Click the website field, enter your canonical URL (the version you want indexed), and save.',
      'Test the link directly from your profile to confirm it resolves without redirects or SSL errors.'
    ],
    template: {
      id: 'website-template',
      title: 'URL checklist',
      description: 'Decide on the canonical URL you want Google to show.',
      text: `Preferred URL: https://[primary-domain.com/]\nUTM tagged URL (optional): https://[primary-domain.com]/?utm_source=google&utm_medium=organic&utm_campaign=gbp\nLanding page for promotions: https://[subpage]\nContact page: https://[subpage]\nNotes about redirects/SSL: [details]`
    },
    tips: [
      'Use the secure HTTPS version of your site to avoid browser warnings.',
      'If you rely on tracking numbers or alternate domains, make sure they redirect with a 301 to the canonical URL.'
    ]
  },
  reviews: {
    summary:
      'Recent reviews prove credibility and impact ranking. Build a repeatable outreach process and respond to every review.',
    entrySteps: [
      'Search Google for your business name while signed in to the Google Business Profile owner account.',
      'Click “See your profile” and scroll to the “Promote” card.',
      'Click “Ask for reviews” to open the dialog containing your short link.'
    ],
    steps: [
      'In the Google Business Profile home panel, click “Ask for reviews” to copy your unique short link.',
      'Share the link with recent customers via email/SMS and remind staff to request reviews right after service is completed.',
      'Monitor the “Reviews” tab weekly and respond to every review within 48 hours.'
    ],
    template: {
      id: 'review-request-template',
      title: 'Review request message',
      description: 'Send this via email or SMS after you finish a job.',
      text: `Hi [Customer name], thanks for choosing [Business name]! Would you mind sharing your experience so neighbors know what to expect? It only takes 60 seconds: [insert Google review link]. We read every review and appreciate your support. – [Rep name]`
    },
    tips: [
      'Only request reviews from real customers and never offer incentives—Google can suspend the listing.',
      'Rotate who on the team is responsible for weekly follow-ups so the process stays consistent.'
    ]
  }
};

function describeManualCompletion(manualCompletion) {
  if (!manualCompletion) {
    return null;
  }

  const status = manualCompletion.status ?? 'pending';

  if (status === 'approved') {
    return 'Marked complete';
  }

  if (status === 'rejected') {
    return 'Marked complete · Needs review';
  }

  return 'Marked complete · Pending Google review';
}

function formatManualCompletionTimestamp(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  try {
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(date);
  } catch (error) {
    return date.toISOString();
  }
}

export default function NextStepsPanel({ steps = [], optimizationHref = null, loading, error, businessId = null }) {
  const [visibleSteps, setVisibleSteps] = useState(() => (Array.isArray(steps) ? steps : []));
  const [activeTaskId, setActiveTaskId] = useState(null);
  const [templateValues, setTemplateValues] = useState({});
  const [copiedTemplateId, setCopiedTemplateId] = useState(null);
  const [copyError, setCopyError] = useState(null);
  const [markingTaskId, setMarkingTaskId] = useState(null);
  const [markError, setMarkError] = useState(null);
  const [markSuccess, setMarkSuccess] = useState(null);

  useEffect(() => {
    setVisibleSteps(Array.isArray(steps) ? steps : []);
  }, [steps]);

  const hasTasks = Array.isArray(visibleSteps) && visibleSteps.length > 0;

  const activeTask = useMemo(() => {
    if (!activeTaskId) {
      return null;
    }

    return visibleSteps.find((task) => task.id === activeTaskId) ?? null;
  }, [visibleSteps, activeTaskId]);

  const overlayGuide = useMemo(() => {
    if (!activeTask) {
      return null;
    }

    return TASK_GUIDES[activeTask.id] ?? TASK_GUIDES.default;
  }, [activeTask]);

  const overlayDescription = useMemo(() => {
    if (!activeTask) {
      return '';
    }

    if (overlayGuide?.summary) {
      return overlayGuide.summary;
    }

    return (
      activeTask.detail || 'Follow the Google Business Profile checklist items to resolve this.'
    );
  }, [activeTask, overlayGuide]);

  const overlaySteps = useMemo(() => {
    if (!overlayGuide) {
      return [];
    }

    const entrySteps = Array.isArray(overlayGuide.entrySteps)
      ? overlayGuide.entrySteps
      : BASE_NAVIGATION_STEPS;
    const changeSteps = Array.isArray(overlayGuide.steps) ? overlayGuide.steps : [];

    return [...entrySteps, ...changeSteps].filter(Boolean);
  }, [overlayGuide]);

  useEffect(() => {
    if (!activeTask) {
      return;
    }

    const handleKeyUp = (event) => {
      if (event.key === 'Escape') {
        setActiveTaskId(null);
      }
    };

    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [activeTask]);

  useEffect(() => {
    if (!activeTaskId) {
      return;
    }

    const isStillSelected = visibleSteps.some((task) => task.id === activeTaskId);
    if (!isStillSelected) {
      setActiveTaskId(null);
    }
  }, [visibleSteps, activeTaskId]);

  const handleTaskClick = (task) => {
    if (!task) {
      return;
    }

    setActiveTaskId(task.id);
  };

  useEffect(() => {
    setCopiedTemplateId(null);
    setCopyError(null);
    setMarkError(null);
    setMarkSuccess(null);
  }, [activeTask]);

  const closeOverlay = () => setActiveTaskId(null);

  const handleTemplateChange = (templateId, value) => {
    setTemplateValues((prev) => ({
      ...prev,
      [templateId]: value
    }));
  };

  const getTemplateValue = (template) => {
    if (!template) {
      return '';
    }

    return templateValues[template.id] ?? template.text ?? '';
  };

  const handleCopyTemplate = async (template) => {
    if (!template) {
      return;
    }

    const content = getTemplateValue(template).trim();

    if (!content) {
      return;
    }

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(content);
      } else if (typeof document !== 'undefined') {
        const textarea = document.createElement('textarea');
        textarea.value = content;
        textarea.style.position = 'fixed';
        textarea.style.top = '-9999px';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      } else {
        throw new Error('Clipboard access is unavailable in this environment.');
      }

      setCopiedTemplateId(template.id);
      setCopyError(null);
      window.setTimeout(() => setCopiedTemplateId(null), 1800);
    } catch (err) {
      console.error('Unable to copy template', err);
      setCopyError('Copy failed. Highlight the text manually if needed.');
    }
  };

  const manualCompletion = activeTask?.manualCompletion ?? null;
  const manualLabel = describeManualCompletion(manualCompletion);
  const manualTimestamp = formatManualCompletionTimestamp(manualCompletion?.markedAt);
  const isMarking = Boolean(activeTask && markingTaskId === activeTask.id);
  const markButtonDisabled = !businessId || !activeTask || Boolean(manualCompletion) || isMarking;

  const handleMarkComplete = async () => {
    if (!businessId || !activeTask) {
      return;
    }

    setMarkError(null);
    setMarkSuccess(null);
    setMarkingTaskId(activeTask.id);

    try {
      const response = await fetch('/api/optimization-data/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ businessId, taskId: activeTask.id })
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to mark this task complete.');
      }

      if (payload?.completion) {
        setVisibleSteps((prevSteps) => {
          if (!Array.isArray(prevSteps)) {
            return prevSteps;
          }

          return prevSteps.map((task) =>
            task.id === activeTask.id ? { ...task, manualCompletion: payload.completion } : task
          );
        });
      }

      setMarkSuccess('Marked complete. Waiting on Google to approve your changes.');
    } catch (error) {
      setMarkError(error?.message || 'Unable to mark this task complete right now.');
    } finally {
      setMarkingTaskId(null);
    }
  };

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
            {visibleSteps.map((task) => {
              const manualStatusLabel = describeManualCompletion(task.manualCompletion);
              return (
                <li key={task.id}>
                  <button
                    type="button"
                    className={`next-steps-panel__item ${manualStatusLabel ? 'next-steps-panel__manual-select' : ''} `}
                    onClick={() => handleTaskClick(task)}
                  >
                    <div className="next-steps-panel__item-header">
                      <strong>{task.label}</strong>
                      <div className="next-steps-panel__status-group">
                        {manualStatusLabel ? (
                          <span className="status-pill status-pill--muted next-steps-panel__manual-pill">
                            {manualStatusLabel}
                          </span>
                        ) : 
                        <span className="status-pill" data-status={task.status.key}>
                          {task.status.label}
                        </span>
                        }
                      </div>
                    </div>
                    <p>{task.detail}</p>
                  </button>
                </li>
              );
            })}
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
            <div className="task-overlay__detail">
              <div className="task-overlay__summary">
                <p>{overlayDescription}</p>
              </div>
              {manualLabel ? (
                <div className="task-overlay__manual-status">
                  <strong>{manualLabel}</strong>
                  {manualTimestamp ? <span>Marked {manualTimestamp}</span> : null}
                </div>
              ) : null}
              {overlaySteps.length ? (
                <div className="task-overlay__steps">
                  <h4>Step-by-step guide</h4>
                  <ol>
                    {overlaySteps.map((step, index) => (
                      <li key={`${step}-${index}`} className="task-overlay__step-item">
                        <span className="task-overlay__step-index">{index + 1}</span>
                        <p>{step}</p>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
            </div>

            {overlayGuide ? (
              <div className="task-overlay__content">
                {overlayGuide.template ? (
                  <div className="task-guide__section task-guide__template">
                    <div className="task-guide__template-header">
                      <div>
                        <h4>{overlayGuide.template.title}</h4>
                        {overlayGuide.template.description ? (
                          <p>{overlayGuide.template.description}</p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        className="task-guide__copy"
                        onClick={() => handleCopyTemplate(overlayGuide.template)}
                      >
                        {copiedTemplateId === overlayGuide.template.id ? 'Copied!' : 'Copy template'}
                      </button>
                    </div>
                    <textarea
                      value={getTemplateValue(overlayGuide.template)}
                      onChange={(event) =>
                        handleTemplateChange(overlayGuide.template.id, event.target.value)
                      }
                      aria-label={overlayGuide.template.title}
                    />
                    <small>Adjust the content above, then copy/paste it into Google.</small>
                    {copyError ? <p className="task-guide__error">{copyError}</p> : null}
                  </div>
                ) : null}

                {overlayGuide.tips?.length ? (
                  <div className="task-guide__section">
                    <h4>Pro tips</h4>
                    <ul className="task-guide__tips">
                      {overlayGuide.tips.map((tip) => (
                        <li key={tip}>{tip}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {overlayGuide.resources?.length ? (
                  <div className="task-guide__section task-guide__resources">
                    <h4>Helpful resources</h4>
                    <ul>
                      {overlayGuide.resources.map((resource) => (
                        <li key={resource.href}>
                          <a href={resource.href} target="_blank" rel="noreferrer">
                            {resource.label} ↗
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="task-overlay__actions">
              <button type="button" className="task-overlay__close-secondary" onClick={closeOverlay}>
                Close
              </button>
              {businessId ? (
                <button
                  type="button"
                  className="task-overlay__mark-complete"
                  onClick={handleMarkComplete}
                  disabled={markButtonDisabled}
                >
                  {manualCompletion
                    ? 'Marked as complete'
                    : isMarking
                      ? 'Marking…'
                      : 'Mark as Complete'}
                </button>
              ) : null}
            </div>
            {markSuccess ? (
              <p className="task-overlay__mark-message">{markSuccess}</p>
            ) : null}
            {markError ? (
              <p className="task-overlay__mark-message task-overlay__mark-message--error">{markError}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
