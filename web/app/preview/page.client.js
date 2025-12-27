'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useRouter } from 'next/navigation';
import SidebarBrand from '../dashboard/[business]/SidebarBrand';
import Image from 'next/image'
import Link from 'next/link';
import { resolveProfileHealthSummary, resolveSectionHealthLabel } from '../dashboard/[business]/optimization';

const LOADING_STEPS = [
  {
    id: 'queue',
    label: 'Queuing up your Google Business Profile scan…'
  },
  {
    id: 'places',
    label: 'Contacting Google Places and collecting profile details…'
  },
  {
    id: 'roadmap',
    label: 'Mapping optimization opportunities with Local Paint Pilot…'
  },
  {
    id: 'preview',
    label: 'Preparing your preview dashboard…'
  }
];

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function formatTimestamp(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(date);
  } catch (error) {
    console.warn('Failed to format timestamp', error);
    return null;
  }
}

function classNames(...tokens) {
  return tokens.filter(Boolean).join(' ');
}

function LookupSuggestion({ suggestion, isActive, onSelect }) {
  return (
    <button
      type="button"
      onMouseDown={(event) => {
        event.preventDefault();
        onSelect(suggestion);
      }}
      className={classNames(
        'flex w-full flex-col items-start gap-1 rounded-lg border border-border/60 bg-background/95 px-3 py-2 text-left transition hover:border-border hover:bg-background',
        isActive ? 'ring-2 ring-secondary ring-offset-2 ring-offset-background' : ''
      )}
    >
      <span className="text-sm font-medium text-foreground">{suggestion.name || 'Unnamed place'}</span>
      {suggestion.formattedAddress ? (
        <span className="text-xs text-muted-foreground">{suggestion.formattedAddress}</span>
      ) : null}
    </button>
  );
}

function LoadingStep({ label, status }) {
  const tone =
    status === 'complete'
      ? 'bg-emerald-500/15 text-emerald-700 border-emerald-400/70'
      : status === 'active'
        ? 'bg-secondary/15 text-secondary-foreground border-secondary/60'
        : 'bg-muted/10 text-muted-foreground border-transparent';

  return (
    <li
      className={classNames(
        'flex items-center gap-3 rounded-lg border px-3 py-2 text-sm transition',
        tone
      )}
    >
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-current text-xs font-semibold">
        {status === 'complete' ? '✓' : status === 'active' ? '…' : ''}
      </span>
      <span>{label}</span>
    </li>
  );
}

function StatusList({ currentStep }) {
  return (
    <ul className="flex flex-col gap-2">
      {LOADING_STEPS.map((step, index) => {
        const status = index < currentStep ? 'complete' : index === currentStep ? 'active' : 'idle';
        return <LoadingStep key={step.id} label={step.label} status={status} />;
      })}
    </ul>
  );
}

function OpportunityItem({ task }) {
  const impactLabel = Number.isFinite(Number(task.weight)) ? `${Number(task.weight)}% impact` : null;

  return (
    <li className="business-optimization-roadmap__task-card" aria-label="Optimization task">
      <div className="business-optimization-roadmap__task-card-header">
        <div className="business-optimization-roadmap__task-info">
          <strong className="business-optimization-roadmap__task-title">{task.label}</strong>
          {task.detail ? <p className="business-optimization-roadmap__task-detail">{task.detail}</p> : null}
        </div>
        {task.status ? (
          <span className="status-pill" data-status={task.status.key}>
            {task.status.label}
          </span>
        ) : null}
      </div>
      {impactLabel ? <p className="business-optimization-roadmap__task-detail">{impactLabel}</p> : null}
    </li>
  );
}

export default function LandingPage() {
  const [phase, setPhase] = useState('search');
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [lookupState, setLookupState] = useState('idle');
  const [lookupError, setLookupError] = useState('');
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [loadingStep, setLoadingStep] = useState(0);
  const [analysisError, setAnalysisError] = useState('');
  const [placeDetails, setPlaceDetails] = useState(null);
  const [roadmap, setRoadmap] = useState(null);
  const [placeMeta, setPlaceMeta] = useState(null);
  const [trialEmail, setTrialEmail] = useState('');
  const [trialStatus, setTrialStatus] = useState('idle');
  const [trialError, setTrialError] = useState('');
  const [googleLoading, setGoogleLoading] = useState(false);
  const router = useRouter();
  const [leadEmail, setLeadEmail] = useState('');
  const [leadStatus, setLeadStatus] = useState('idle');
  const [leadError, setLeadError] = useState('');
  const [leadId, setLeadId] = useState(null);
  const [existingPreview, setExistingPreview] = useState(false);
  const [leadPreviewStartedAt, setLeadPreviewStartedAt] = useState(null);
  const [leadPreviewCompletedAt, setLeadPreviewCompletedAt] = useState(null);

  const inputRef = useRef(null);

  useEffect(() => {
    if (phase === 'search' && inputRef.current) {
      inputRef.current.focus();
    }
  }, [phase]);

  useEffect(() => {
    if (phase !== 'search') {
      return;
    }

    if (!query.trim()) {
      setSuggestions([]);
      setLookupState('idle');
      setLookupError('');
      return;
    }

    const controller = new AbortController();
    const handler = setTimeout(async () => {
      setLookupState('loading');
      setLookupError('');

      try {
        const response = await fetch(`/api/places/search?query=${encodeURIComponent(query.trim())}`, {
          signal: controller.signal
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || 'Lookup failed.');
        }

        const payload = await response.json();
        const results = Array.isArray(payload.results) ? payload.results : [];
        setSuggestions(results);
        setLookupState(results.length ? 'success' : 'empty');
        setActiveIndex(results.length ? 0 : -1);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        console.error('Places lookup failed', error);
        setLookupState('error');
        setLookupError(error.message || 'Unable to search Google Places right now.');
      }
    }, 300);

    return () => {
      clearTimeout(handler);
      controller.abort();
    };
  }, [phase, query]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const storageKey = 'localpaintpilot:funnelLeadId';

    try {
      if (leadId) {
        window.sessionStorage?.setItem(storageKey, leadId.toString());
      } else {
        window.sessionStorage?.removeItem(storageKey);
      }
    } catch (error) {
      console.warn('Failed to persist lead id', error);
    }

    try {
      const url = new URL(window.location.href);
      if (leadId) {
        url.searchParams.set('lead', leadId.toString());
      } else {
        url.searchParams.delete('lead');
      }

      const search = url.searchParams.toString();
      const nextUrl = `${url.pathname}${search ? `?${search}` : ''}${url.hash}`;
      window.history.replaceState(window.history.state, '', nextUrl);
    } catch (error) {
      console.warn('Failed to update lead id in URL', error);
    }
  }, [leadId]);

  const resetFlow = useCallback(() => {
    setPhase('search');
    setQuery('');
    setSuggestions([]);
    setActiveIndex(-1);
    setLookupState('idle');
    setLookupError('');
    setSelectedPlace(null);
    setLoadingStep(0);
    setAnalysisError('');
    setPlaceDetails(null);
    setRoadmap(null);
    setPlaceMeta(null);
        setTrialEmail('');
        setTrialStatus('idle');
        setTrialError('');
        setGoogleLoading(false);
    setLeadEmail('');
    setLeadStatus('idle');
    setLeadError('');
    setLeadId(null);
    setExistingPreview(false);
    setLeadPreviewStartedAt(null);
    setLeadPreviewCompletedAt(null);
  }, []);

  const startLeadCapture = useCallback((place) => {
    if (!place?.placeId) {
      return;
    }

    setSelectedPlace(place);
    setPhase('lead');
    setLeadStatus('idle');
    setLeadError('');
    setAnalysisError('');
    setPlaceDetails(null);
    setRoadmap(null);
    setPlaceMeta(null);
    setLoadingStep(0);
    setExistingPreview(false);
    setLeadPreviewStartedAt(null);
    setLeadPreviewCompletedAt(null);
    setLeadId(null);
  }, []);

  const beginAnalysis = useCallback(
    async (place) => {
      if (!place?.placeId) {
        return;
      }

      setSelectedPlace(place);
      setPhase('loading');
      setLoadingStep(0);
      setAnalysisError('');
      setPlaceDetails(null);
      setRoadmap(null);
      setPlaceMeta(null);

      try {
        setLoadingStep(1);
        await new Promise((resolve) => setTimeout(resolve, 400));

        const response = await fetch(`/api/places/${encodeURIComponent(place.placeId)}`);
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || 'Failed to load place details.');
        }

        setLoadingStep(2);
        const payload = await response.json();
        const details = payload.place ?? null;
        const roadmapResult = payload.roadmap ?? null;
        const meta = payload.meta ?? null;

        setPlaceDetails(details);
        setRoadmap(roadmapResult);
        setPlaceMeta(meta);
        setLoadingStep(3);

        await new Promise((resolve) => setTimeout(resolve, 500));
        setPhase('preview');

      } catch (error) {
        console.error('Analysis failed', error);
        setAnalysisError(error.message || 'We hit an unexpected issue while analyzing the profile.');
        setPlaceMeta(null);
        setPhase('error');
      }
    },
    []
  );

  const handleSubmitLookup = useCallback(
    (event) => {
      event.preventDefault();

      const activeSuggestion = activeIndex >= 0 ? suggestions[activeIndex] : null;
      const selected = activeSuggestion || suggestions[0];

      if (!selected) {
        setLookupError('Choose a Google Business Profile from the suggestions to continue.');
        setLookupState('error');
        return;
      }

      startLeadCapture(selected);
    },
    [activeIndex, startLeadCapture, suggestions]
  );

  const handleLookupKeyDown = useCallback(
    (event) => {
      if (!suggestions.length) {
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((index) => (index + 1) % suggestions.length);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((index) => (index - 1 + suggestions.length) % suggestions.length);
      }
    },
    [suggestions]
  );

  const handleLeadSubmit = useCallback(
    async (event) => {
      event.preventDefault();

      if (!selectedPlace?.placeId) {
        setLeadError('Select a Google Business Profile to continue.');
        return;
      }

      setLeadError('');

      const trimmedEmail = leadEmail.trim().toLowerCase();
      if (!emailPattern.test(trimmedEmail)) {
        setLeadError('Enter a valid work email to continue.');
        return;
      }

      setLeadStatus('submitting');
      setPhase('loading');
      setLoadingStep(0);
      setAnalysisError('');
      setPlaceDetails(null);
      setRoadmap(null);
      setPlaceMeta(null);

      try {
        const response = await fetch('/api/funnel/lead', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: trimmedEmail,
            place: {
              placeId: selectedPlace.placeId,
              name: selectedPlace.name,
              formattedAddress: selectedPlace.formattedAddress,
              location: selectedPlace.location
            }
          })
        });

        const payload = await response.json().catch(() => ({}));

        if (!response.ok || !payload?.leadId) {
          throw new Error(payload.error || 'Unable to start your preview right now.');
        }

        const resolvedPlace = payload.place?.placeId ? payload.place : selectedPlace;

        setLeadStatus('success');
        setLeadEmail(trimmedEmail);
        setLeadId(payload.leadId);
        setExistingPreview(Boolean(payload.existingPreview));
        setLeadPreviewStartedAt(payload.previewStartedAt ?? null);
        setLeadPreviewCompletedAt(payload.previewCompletedAt ?? null);
        setTrialEmail((current) => current || trimmedEmail);

        await beginAnalysis(resolvedPlace);

        try {
          await fetch('/api/highlevel/contact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: trimmedEmail,
              companyName: selectedPlace.name,
              address1: selectedPlace.formattedAddress,
              tags: ['preview_funnel'],
            }),
          });
        } catch (error) {
          console.error('Failed to sync HighLevel contact for registration', error);
        }

      } catch (error) {
        console.error('Lead capture failed', error);
        setLeadStatus('idle');
        setLeadError(error.message || 'Unable to start your preview right now.');
        setPhase('lead');
      }
    },
    [beginAnalysis, leadEmail, selectedPlace]
  );

  const topOpportunities = useMemo(() => {
    if (!roadmap || !Array.isArray(roadmap.tasks)) {
      return [];
    }

    return roadmap.tasks
      .filter((task) => task.status && task.status.key !== 'completed')
      .sort((a, b) => (Number(b.weight) || 0) - (Number(a.weight) || 0))
      .slice(0, 3);
  }, [roadmap]);

  const handleTrialSubmit = useCallback(
    async (event) => {
      event.preventDefault();
      setTrialError('');

      const trimmedEmail = trialEmail.trim();
      if (!emailPattern.test(trimmedEmail.toLowerCase())) {
        setTrialError('Enter a valid work email to start your trial.');
        return;
      }

      setTrialStatus('submitting');

      try {
        const response = await fetch('/api/public/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: trimmedEmail
          })
        });

        const payload = await response.json().catch(() => ({}));

        if (!response.ok || !payload?.success) {
          throw new Error(payload.error || 'Unable to start your trial right now.');
        }

        setTrialStatus('success');
        try {
          await fetch('/api/auth/bootstrap', {
            method: 'POST',
            credentials: 'include'
          });
        } catch (bootstrapError) {
          console.error('Failed to bootstrap trial user', bootstrapError);
        }
        await router.push('/dashboard');
      } catch (error) {
        console.error('Trial registration failed', error);
        setTrialStatus('idle');
        setTrialError(error.message || 'We could not process your trial request.');
      }
    },
    [router, trialEmail]
  );

  const handleTrialGoogleSignup = useCallback(() => {
    setTrialError('');
    setGoogleLoading(true);

    const navigationTimeout = setTimeout(() => {
      setGoogleLoading(false);
      setTrialError('Failed to initiate Google sign-up. Please try again.');
    }, 5000);

    try {
      const redirect = encodeURIComponent('/dashboard');
      window.location.assign(`/api/auth/google?redirect=${redirect}`);
    } catch (error) {
      clearTimeout(navigationTimeout);
      console.error('Google signup flow failed', error);
      setTrialError(error.message || 'Unable to continue with Google right now.');
      setGoogleLoading(false);
    }
  }, []);

  const renderSearch = () => (
    <div className="page-shell">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 lg:gap-12">
        <section className="space-y-4">
          <span className="inline-flex items-center rounded-full border border-secondary/40 bg-secondary/10 px-3 py-1 text-xs font-medium uppercase tracking-wide text-secondary-foreground">
            New: Guided preview
          </span>
          <h1 className="text-4xl font-semibold text-foreground">Preview your Local Paint Pilot dashboard</h1>
          <p className="text-lg leading-relaxed text-muted-foreground">
            Enter your Google Business Profile name and we&apos;ll pull live Google Places data, map optimization wins, and show how the dashboard guides your rankings.
          </p>
        </section>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Find your Google Business Profile</CardTitle>
            <CardDescription>Start typing your business name—we&apos;ll search Google automatically.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-4" onSubmit={handleSubmitLookup}>
              <div className="space-y-2">
                <Label htmlFor="profile-search">Business name</Label>
                <Input
                  id="profile-search"
                  ref={inputRef}
                  type="text"
                  value={query}
                  placeholder="e.g. Local Paint Pros Austin"
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={handleLookupKeyDown}
                  autoComplete="off"
                />
              </div>

              {lookupState === 'loading' ? (
                <p className="text-sm text-muted-foreground">Searching Google Places…</p>
              ) : null}

              {lookupState === 'error' && lookupError ? (
                <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
                  {lookupError}
                </p>
              ) : null}

              {lookupState === 'empty' ? (
                <p className="text-sm text-muted-foreground">No Google profiles matched that search yet.</p>
              ) : null}

              {suggestions.length ? (
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Suggestions</p>
                  <div className="flex flex-col gap-2">
                    {suggestions.map((suggestion, index) => (
                      <LookupSuggestion
                        key={suggestion.placeId}
                        suggestion={suggestion}
                        isActive={index === activeIndex}
                        onSelect={(choice) => startLeadCapture(choice)}
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap justify-end gap-3">
                <Button type="submit" disabled={!suggestions.length}>Analyze my profile</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  const renderLeadCapture = () => {
    if (!selectedPlace) {
      return renderSearch();
    }

    return (
      <div className="page-shell">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">

          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle>Confirm your profile</CardTitle>
              <CardDescription className="mb-2">Drop your email to save the preview and kick off the scan.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-6" onSubmit={handleLeadSubmit}>
                <div className="rounded-xl border border-border/60 bg-muted/10 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Google profile</p>
                  <p className="mt-2 text-lg font-semibold text-foreground">{selectedPlace.name || 'Unnamed profile'}</p>
                  {selectedPlace.formattedAddress ? (
                    <p className="text-sm text-muted-foreground">{selectedPlace.formattedAddress}</p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="lead-email">Work email</Label>
                  <Input
                    id="lead-email"
                    type="email"
                    value={leadEmail}
                    onChange={(event) => setLeadEmail(event.target.value)}
                    placeholder="you@company.com"
                    autoComplete="email"
                    disabled={leadStatus === 'submitting'}
                    required
                  />
                </div>

                {leadError ? (
                  <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
                    {leadError}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground"></p>
                )}

                <div className="flex flex-wrap justify-between gap-3">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setPhase('search');
                      setSelectedPlace(null);
                      setLeadStatus('idle');
                      setLeadError('');
                    }}
                  >
                    Pick a different profile
                  </Button>
                  <Button type="submit" disabled={leadStatus === 'submitting'}>
                    {leadStatus === 'submitting' ? 'Saving your preview…' : 'Generate your FREE preview'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  };

  const renderLoading = () => (
    <div className="page-shell">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <section className="space-y-3">
          <h1 className="text-3xl font-semibold text-foreground">Building your preview dashboard</h1>
          <p className="text-base text-muted-foreground">
            Hang tight while we pull fresh data from Google and assemble your optimization roadmap.
          </p>
        </section>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>What&apos;s happening</CardTitle>
            <CardDescription>We keep you posted as each step completes.</CardDescription>
          </CardHeader>
          <CardContent>
            <StatusList currentStep={loadingStep} />
          </CardContent>
        </Card>
      </div>
    </div>
  );

  const renderError = () => (
    <div className="page-shell">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <section className="space-y-3">
          <h1 className="text-3xl font-semibold text-foreground">We couldn&apos;t build the preview</h1>
          <p className="text-base text-muted-foreground">{analysisError || 'Something unexpected happened.'}</p>
        </section>

        <div className="flex flex-wrap gap-3">
          <Button onClick={() => (selectedPlace ? beginAnalysis(selectedPlace) : resetFlow())}>
            Try again
          </Button>
          <Button variant="ghost" onClick={resetFlow}>
            Search a different profile
          </Button>
        </div>
      </div>
    </div>
  );

  const renderPreview = () => {
    const progressPercent = Number.isFinite(Number(roadmap?.progressPercent))
      ? Math.max(0, Math.min(100, Number(roadmap.progressPercent)))
      : null;
    const sections = Array.isArray(roadmap?.sections) ? roadmap.sections : [];
    const previewTimestampLabel = formatTimestamp(leadPreviewCompletedAt || leadPreviewStartedAt);
    const profileHealth = resolveProfileHealthSummary(progressPercent);

    return (
      <div className="dashboard-layout__body">
        <aside className="dashboard-layout__sidebar" aria-label="Workspace navigation">
          <SidebarBrand />
          <div className="dashboard-sidebar__menu">
            
          </div>
        </aside>

        <div className="dashboard-layout__main">
          <header className="dashboard-layout__header">
            <div className="dashboard-layout__header-container">
              <div className="dashboard-header">
                <div className="dashboard-header__content">
                  <h1 className="page-title">{placeDetails?.name || selectedPlace?.name || 'Preview dashboard'}</h1>
                  {placeDetails?.formattedAddress ? (
                    <span className="dashboard-sidebar__location">{placeDetails.formattedAddress}</span>
                  ) : null}                  
                </div>
              </div>
            </div>
          </header>
          {placeMeta?.sidebarPending ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p className="font-semibold">We&apos;re still gathering some data</p>
              <p className="text-amber-800/80">
                Google Posts details are loading in the background. Sections that rely on that data will update shortly.
              </p>
            </div>
          ) : null}
            <div className="dashboard-layout__content">
            <h2 className="mt-4 text-2xl font-semibold text-foreground">Your audit is complete, next step is to fix these issues and increase your rankings.</h2>

            <section className="business-dashboard__hero">
                <div className="business-dashboard__optimization-row">
                  <div className="surface-card surface-card--muted dashboard-optimization-card">
                    <div className="section-header">
                      <div>
                        <h2 className="section-title">Profile Health</h2>
                        <p className="section-caption">{profileHealth.headline}</p>
                      </div>
                      <div className="dashboard-optimization-card__scores">
                        <div>
                          <strong>{profileHealth.statusLabel}</strong>
                        </div>
                      </div>
                    </div>
                    <div className="dashboard-optimization-card__content">
                      {profileHealth.showProgressBar ? (
                        <div className="dashboard-optimization-card__progress" aria-label="Profile health momentum">
                          <div
                            style={{
                              width: `${Math.min(100, Math.max(0, profileHealth.progressFill ?? 0))}%`
                            }}
                          />
                        </div>
                      ) : null}
                      <p className="dashboard-optimization-card__message">{profileHealth.headline}</p>
                      <p className="dashboard-optimization-card__notice">{profileHealth.reinforcement}</p>
                      <p className="dashboard-optimization-card__notice">
                        <strong>Next focus:</strong> {profileHealth.nextFocus}
                      </p>
                    </div>
          {previewTimestampLabel ? (
            <div
              className={classNames(
                'rounded-lg border px-4 py-3 mt-5 mb-4 text-sm',
                existingPreview
                  ? 'border-secondary/60 bg-secondary/10 text-secondary-foreground'
                  : 'border-border/60 bg-muted/10 text-muted-foreground'
              )}
            >
              {existingPreview
                ? `We already created this preview on ${previewTimestampLabel}. Showing that same snapshot.`
                : `Preview generated on ${previewTimestampLabel}.`}
            </div>
          ) : null}                  
                </div>
                <div className="surface-card surface-card--muted dashboard-optimization-card">
                  <div>
                    <h2 className="section-title">Score Summary</h2>
                    <p className="section-caption">Here&apos;s how we score your profilel</p>
                  </div>
                  {sections.length ? (
                    <div className="business-optimization-roadmap__section-item">
                        {sections.map((section) => (
                          <div key={section.id} className="business-optimization-roadmap__section-header">
                            <span className="business-optimization-roadmap__section-summary-card-title">{section.title}</span>
                            <strong className="business-optimization-roadmap__section-summary-card-completion">
                              {resolveSectionHealthLabel(section.id, section.completion)}
                            </strong>
                          </div>
                        ))}
                    </div>
                  ) : null}   
                </div>             
              </div>
              <div className="business-dashboard__top-row"></div>
          </section>
          <div className="rounded-lg border surface-card surface-card--muted px-4 py-3 text-sm flex justify-between items-center">
            <div>
              <h2 className="section-title">Get Started for FREE</h2>
              <p className="section-caption">
                <a href="#freetrial">Start a free trial to get step by step instructions on how to improve your profile & rankings.</a>
              </p>
            </div>
            <Link href="#freetrial" className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-1 px-2 rounded">
              Upgrade Now
            </Link>

          </div>

          <section className="space-y-4">
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold text-foreground">Start improving your profile to get more customers.</h2>
              <p className="text-sm text-muted-foreground">
                We highlighted your top recommendations. 
              </p>
            </div>
            <div className="business-funnel__section-task-heatmap">
              {topOpportunities.length ? (
                <div className="business-funnel__section-task-list-left">
                  <ul className="business-optimization-roadmap__section-task-list">
                    {topOpportunities.map((task) => (
                      <OpportunityItem key={task.id} task={task} />
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Great news—your automated checks look complete. Kick off a trial to explore advanced tools.
                </p>
              )}
            </div>
          </section>

          <section className="space-y-4">
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold text-foreground">Track your progress with weekly ranking reports.</h2>
              <p className="text-sm text-muted-foreground">
                These ranking maps show where you are showing up when potential customers search for services your business offers.
              </p>
            </div>
            <div class="surface-card surface-card--muted dashboard-optimization-card business-funnel__section-task-heatmap">
              <div className="business-funnel__section-teaser-container">
                <div className="business-funnel__section-teaser">
                  <p className="text-sm text-muted-foreground">Demo Heat Map<br />
                  Start your Free trial to get a live report specific to your business. </p>
                </div>
                <Image className="business-funnel__heatmap-demo" src="/images/localpaintpilot-ranking-demo.png" alt="Local Paint Pilot Ranking Heat Map" width={250} height={250} />
              </div>
            </div>
          </section>

          <Card id="freetrial" className="shadow-lg">
            <CardHeader>
            <CardTitle>Start your 7 day Local Paint Pilot trial</CardTitle>
            <CardDescription>
              Share your work email and we&apos;ll create your workspace with instant access to the Local Paint Pilot dashboard.
            </CardDescription>
            </CardHeader>
            <CardContent>
              {trialStatus === 'success' ? (
                <div className="space-y-3 rounded-md border border-emerald-400/60 bg-emerald-500/10 p-4 text-sm text-emerald-700">
                  <p className="font-semibold">You&apos;re all set!</p>
                  <p>We&apos;re preparing your workspace and will take you straight into the dashboard.</p>
                </div>
              ) : (
                <form className="grid gap-4 md:grid-cols-2" onSubmit={handleTrialSubmit}>
                  <div className="md:col-span-1 space-y-2">
                    <Label htmlFor="trial-email">Work email</Label>
                    <Input
                      id="trial-email"
                      type="email"
                      value={trialEmail}
                      onChange={(event) => setTrialEmail(event.target.value)}
                      placeholder="you@company.com"
                      disabled={trialStatus === 'submitting' || googleLoading}
                      required
                    />
                  </div>
                  <div className="md:col-span-2 flex flex-wrap items-center gap-4">
                    <Button type="submit" disabled={trialStatus === 'submitting' || googleLoading}>
                      {trialStatus === 'submitting' ? 'Starting your trial…' : 'Start my free trial'}
                    </Button>
                    {trialError ? (
                      <span className="text-sm text-destructive" role="alert">
                        {trialError}
                      </span>
                    ) : ( null )}
                  </div>

                  <div className="md:col-span-2 flex flex-col gap-4">
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <div className="h-px flex-1 bg-border" aria-hidden />
                      <span>or</span>
                      <div className="h-px flex-1 bg-border" aria-hidden />
                    </div>

                    <Button
                      type="button"
                      variant="secondary"
                      className="w-full"
                      onClick={handleTrialGoogleSignup}
                      disabled={trialStatus === 'submitting' || googleLoading}
                    >
                      {googleLoading ? 'Preparing Google sign-up…' : 'Continue with Google'}
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
            {trialStatus !== 'success' ? (
              <CardFooter>
                <p className="text-xs text-muted-foreground">
                  Trials include full access to dashboards, keyword rank tracking, and live operations tooling. Cancel anytime during the first 7 days.
                </p>
              </CardFooter>
            ) : null}
          </Card>
          </div>
        </div>
      </div>
    );
  };

  if (phase === 'lead') {
    return renderLeadCapture();
  }

  if (phase === 'loading') {
    return renderLoading();
  }

  if (phase === 'preview') {
    return renderPreview();
  }

  if (phase === 'error') {
    return renderError();
  }

  return renderSearch();
}
