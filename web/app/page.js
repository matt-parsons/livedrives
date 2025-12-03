'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  auth,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInWithEmailAndPassword
} from '@/lib/firebaseClient';

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

const GEO_GRID_SAMPLE = [7, 4, 3, 2, 5, 6, 9, 12, 8, 5, 4, 7, 16, 11, 6, 3, 6, 9, 13, 7, 5, 7, 8, 6, 4];
const GEO_GRID_COLUMNS = 5;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

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

async function exchangeSession(idToken) {
  const response = await fetch('/api/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ idToken })
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Unable to start your session.');
  }
}

async function bootstrapSession() {
  const response = await fetch('/api/auth/bootstrap', {
    method: 'POST',
    credentials: 'include'
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Unable to finish bootstrapping your account.');
  }

  return response.json();
}

export default function IndexPage() {
  const router = useRouter();
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
  const [trialName, setTrialName] = useState('');
  const [trialEmail, setTrialEmail] = useState('');
  const [trialPassword, setTrialPassword] = useState('');
  const [trialStatus, setTrialStatus] = useState('idle');
  const [trialError, setTrialError] = useState('');
  const [leadEmail, setLeadEmail] = useState('');
  const [leadStatus, setLeadStatus] = useState('idle');
  const [leadError, setLeadError] = useState('');
  const [leadId, setLeadId] = useState(null);
  const [existingPreview, setExistingPreview] = useState(false);
  const [leadPreviewStartedAt, setLeadPreviewStartedAt] = useState(null);
  const [leadPreviewCompletedAt, setLeadPreviewCompletedAt] = useState(null);
  const [activeOpportunity, setActiveOpportunity] = useState(null);
  const [overviewStatus, setOverviewStatus] = useState('idle');
  const [overviewSummary, setOverviewSummary] = useState('');
  const [overviewError, setOverviewError] = useState('');

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
    setTrialName('');
    setTrialEmail('');
    setTrialPassword('');
    setTrialStatus('idle');
    setTrialError('');
    setLeadEmail('');
    setLeadStatus('idle');
    setLeadError('');
    setLeadId(null);
    setExistingPreview(false);
    setLeadPreviewStartedAt(null);
    setLeadPreviewCompletedAt(null);
    setOverviewStatus('idle');
    setOverviewSummary('');
    setOverviewError('');
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
    setLoadingStep(0);
    setExistingPreview(false);
    setLeadPreviewStartedAt(null);
    setLeadPreviewCompletedAt(null);
    setLeadId(null);
    setOverviewStatus('idle');
    setOverviewSummary('');
    setOverviewError('');
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
      setOverviewStatus('idle');
      setOverviewSummary('');
      setOverviewError('');

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

        setPlaceDetails(details);
        setRoadmap(roadmapResult);
        setOverviewStatus('idle');
        setOverviewSummary('');
        setOverviewError('');
        setLoadingStep(3);

        await new Promise((resolve) => setTimeout(resolve, 500));
        setPhase('preview');

        if (details?.name) {
          setTrialName(details.name);
        }
      } catch (error) {
        console.error('Analysis failed', error);
        setAnalysisError(error.message || 'We hit an unexpected issue while analyzing the profile.');
        setPhase('error');
      }
    },
    []
  );

  useEffect(() => {
    if (!placeDetails?.placeId) {
      setOverviewStatus('idle');
      setOverviewSummary('');
      setOverviewError('');
      return;
    }

    let aborted = false;

    const loadOverview = async () => {
      setOverviewStatus('loading');
      setOverviewError('');
      setOverviewSummary('');

      try {
        const response = await fetch(
          `/api/places/${encodeURIComponent(placeDetails.placeId)}/overview`
        );
        const payload = await response.json().catch(() => ({}));

        if (!response.ok || !payload?.overview) {
          throw new Error(payload.error || 'Failed to summarize the profile.');
        }

        if (!aborted) {
          setOverviewSummary(payload.overview);
          setOverviewStatus('success');
        }
      } catch (error) {
        if (!aborted) {
          setOverviewStatus('error');
          setOverviewError(error.message || 'Failed to summarize the profile.');
        }
      }
    };

    loadOverview();

    return () => {
      aborted = true;
    };
  }, [placeDetails?.placeId]);

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
      } catch (error) {
        console.error('Lead capture failed', error);
        setLeadStatus('idle');
        setLeadError(error.message || 'Unable to start your preview right now.');
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

  const closeOpportunityOverlay = useCallback(() => {
    setActiveOpportunity(null);
  }, []);

  const handleTrialSubmit = useCallback(
    async (event) => {
      event.preventDefault();
      setTrialError('');

      const trimmedEmail = trialEmail.trim();
      if (!emailPattern.test(trimmedEmail.toLowerCase())) {
        setTrialError('Enter a valid work email to start your trial.');
        return;
      }

      if (trialPassword.length < MIN_PASSWORD_LENGTH) {
        setTrialError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
        return;
      }

      setTrialStatus('submitting');

      try {
        let credential;

        try {
        credential = await createUserWithEmailAndPassword(trimmedEmail, trialPassword);
      } catch (error) {
        if (error.code === 'auth/email-already-in-use') {
            credential = await signInWithEmailAndPassword(trimmedEmail, trialPassword);
          } else {
            throw error;
          }
        }

        if (!credential?.user) {
          throw new Error('Unable to set up your account right now.');
        }

        try {
          if (!credential.user.emailVerified) {
            await sendEmailVerification(credential.user);
          }
        } catch (emailError) {
          console.warn('Failed to send Firebase verification email', emailError);
        }

        const idToken = await credential.user.getIdToken();

        const response = await fetch('/api/public/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: trialName?.trim?.() || trialName,
            email: trimmedEmail
          })
        });

        const payload = await response.json().catch(() => ({}));

        if (!response.ok || !payload?.success) {
          throw new Error(payload.error || 'Unable to start your trial right now.');
        }

        await exchangeSession(idToken);
        await bootstrapSession();
        await auth.signOut();

        setTrialStatus('success');
        router.push('/dashboard');
        router.refresh();
      } catch (error) {
        console.error('Trial registration failed', error);
        setTrialStatus('idle');
        setTrialError(error.message || 'We could not process your trial request.');
      }
    },
    [trialEmail, trialName, trialPassword, router]
  );

  const renderSearch = () => (
    <div className="trial-preview-page">
      <div className="page-shell">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 lg:gap-12">
          <section className="trial-preview-hero space-y-4">
            <span className="trial-preview-badge inline-flex items-center rounded-full border border-secondary/40 bg-secondary/10 px-3 py-1 text-xs font-medium uppercase tracking-wide text-secondary-foreground">
              Special Offer
            </span>
            <h1 className="text-4xl font-semibold text-foreground">Sign up - Try Local Paint Pilot for free</h1>
            <p className="text-lg leading-relaxed text-muted-foreground">
              Enter your Google Business Profile name and we&apos;ll pull live ata, map optimization wins, and show how the dashboard guides your rankings.
            </p>
          </section>

          <Card className="shadow-lg trial-preview-card surface-card surface-card--muted">
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
    </div>
  );

  const renderLeadCapture = () => {
    if (!selectedPlace) {
      return renderSearch();
    }

    return (
      <div className="trial-preview-page">
        <div className="page-shell">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">

            <Card className="shadow-lg trial-preview-card surface-card surface-card--muted">
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
      </div>
    );
  };

  const renderLoading = () => (
    <div className="trial-preview-page">
      <div className="page-shell">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
          <section className="space-y-3">
            <h1 className="text-3xl font-semibold text-foreground">Building your preview dashboard</h1>
            <p className="text-base text-muted-foreground">
              Hang tight while we pull fresh data from Google and assemble your optimization roadmap.
            </p>
          </section>

            <Card className="shadow-lg trial-preview-card surface-card surface-card--muted">
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
    </div>
  );

  const renderError = () => (
    <div className="trial-preview-page">
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
    </div>
  );

  const renderPreview = () => {
    const progressPercent = Number.isFinite(Number(roadmap?.progressPercent))
      ? Math.max(0, Math.min(100, Number(roadmap.progressPercent)))
      : null;
    const sections = Array.isArray(roadmap?.sections) ? roadmap.sections : [];
    const previewTimestampLabel = formatTimestamp(leadPreviewCompletedAt || leadPreviewStartedAt);
    const geoGridMaxValue = Math.max(...GEO_GRID_SAMPLE);

    return (
      <div className="trial-preview-page">
        <div className="page-shell">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 lg:gap-12">
          <section className="trial-preview-section surface-card surface-card--muted flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-2">
                <h1 className="text-4xl font-semibold text-foreground">
                  {placeDetails?.name || selectedPlace?.name || 'Preview dashboard'}
                </h1>
                {placeDetails?.formattedAddress ? (
                  <p className="text-base text-muted-foreground">{placeDetails.formattedAddress}</p>
                ) : null}
              </div>
              <div className="trial-preview-kpi flex items-center gap-3 rounded-full border border-secondary/60 bg-secondary/10 px-4 py-2">
                <span className="text-sm font-medium text-secondary-foreground">Overall progress</span>
                <span className="text-2xl font-semibold text-secondary-foreground">
                  {progressPercent === null ? 'No score yet' : `${progressPercent}%`}
                </span>
              </div>
            </div>
            <p className="text-base leading-relaxed text-muted-foreground">
              Here&apos;s how Local Paint Pilot scores your Google profile. Upgrade to a 7 day trial to unlock the full dashboard, keyword rank tracking, and automation.
            </p>
            {previewTimestampLabel ? (
              <div
                className={classNames(
                  'rounded-lg border px-4 py-3 text-sm',
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
            <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
              {Array.isArray(placeDetails?.categories) && placeDetails.categories.length ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/80 px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {placeDetails.categories.join(' · ')}
                </span>
              ) : null}
              {placeDetails?.googleMapsUri ? (
                <a
                  href={placeDetails.googleMapsUri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-full border border-secondary/60 bg-secondary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-secondary-foreground"
                >
                  View on Google Maps ↗
                </a>
              ) : null}
            </div>
          </section>

          <section className="trial-preview-section surface-card surface-card--muted space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold text-foreground">Overall progress</h2>
                <p className="text-sm text-muted-foreground">
                  Complete all tasks to maximize your ranking potential
                </p>
              </div>
            </div>

            <div className="space-y-2 rounded-lg border border-border/60 bg-background/80 p-4">
              <p className="text-sm font-semibold text-foreground">Profile rundown</p>
              {overviewStatus === 'loading' ? (
                <p className="text-sm text-muted-foreground">Getting a blue-collar read on your profile…</p>
              ) : null}
              {overviewStatus === 'error' && overviewError ? (
                <p className="text-sm text-destructive">{overviewError}</p>
              ) : null}
              {overviewStatus === 'success' && overviewSummary ? (
                <p className="whitespace-pre-line text-base leading-relaxed text-muted-foreground">
                  {overviewSummary}
                </p>
              ) : null}
            </div>

            <div
              className={`business-optimization-roadmap__sections-summary ${
                sections.length
                  ? 'business-optimization-roadmap__sections-summary--with-sections'
                  : 'business-optimization-roadmap__sections-summary--without-sections'
              }`}
            >
              <div className="business-optimization-roadmap__summary-header">
                <h2 class="section-title">GBP Score Optimization</h2>
                <span className="business-optimization-roadmap__summary-progress">
                  <strong>{progressPercent === null ? 'No score yet' : `${progressPercent}%`}</strong>
                </span>
              </div>
              <div aria-hidden="true" className="business-optimization-roadmap__progress-track">
                <div
                  className="business-optimization-roadmap__progress-fill"
                  style={{ width: `${progressPercent === null ? 0 : progressPercent}%` }}
                />
              </div>
            </div>

            {sections.length ? (
              <div className="business-optimization-roadmap__section-summary-grid">
                {sections.map((section) => (
                  <div key={section.id} className="business-optimization-roadmap__section-summary-card">
                    <span className="business-optimization-roadmap__section-summary-card-title">{section.title}</span>
                    <strong className="business-optimization-roadmap__section-summary-card-completion">
                      {section.completion === null ? 'No score yet' : `${section.completion}% complete`}
                    </strong>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <section className="trial-preview-section surface-card surface-card--muted space-y-4">
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold text-foreground">Next steps to improve your profile</h2>
              <p className="text-sm text-muted-foreground">
                We highlighted your top 3 recommendations. Start a free trial to sign in and review the rest.
              </p>
            </div>
            {topOpportunities.length ? (
              <ul className="next-steps-panel__list trial-preview__next-steps">
                {topOpportunities.map((task) => {
                  const impactLabel = Number.isFinite(Number(task.weight)) ? `${Number(task.weight)}% impact` : null;
                  return (
                    <li key={task.id}>
                      <button
                        type="button"
                        className="next-steps-panel__item trial-preview__next-step-button"
                        onClick={() => setActiveOpportunity(task)}
                      >
                        <div className="next-steps-panel__item-header">
                          <strong>{task.label}</strong>
                          {task.status ? (
                            <span className="status-pill" data-status={task.status.key}>
                              {task.status.label}
                            </span>
                          ) : null}
                        </div>
                        {task.detail ? <p>{task.detail}</p> : null}
                        {impactLabel ? <p className="business-optimization-roadmap__task-detail">{impactLabel}</p> : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                Great news—your automated checks look complete. Kick off a trial to explore advanced tools.
              </p>
            )}
          </section>

          <Card className="shadow-lg trial-preview-card surface-card surface-card--muted">
            <CardHeader>
              <CardTitle>See your geo grid coverage</CardTitle>
              <CardDescription>
                We track how you rank across your service area. Start a free trial to unlock the interactive map and alerts.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="geo-grid-preview">
                <div
                  className="geo-grid-preview__grid"
                  aria-hidden="true"
                >
                  <div className="geo-grid-preview__demo">
                    <img src="images/localpaintpilot-ranking-demo.png" />
                  </div>
                  <div className="geo-grid-preview__overlay">
                    <p className="geo-grid-preview__overlay-title">Geo grid preview locked</p>
                    <p className="geo-grid-preview__overlay-copy">
                      Start your 7 day trial to reveal live rankings, coverage gaps, and weekly change alerts.
                    </p>
                  </div>
                </div>
              </div>
              <div className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
                <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
                  <p className="font-semibold text-foreground">Track coverage by neighborhood</p>
                  <p>We map rankings across a 5x5 grid so you can see where you win and where to improve.</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
                  <p className="font-semibold text-foreground">Alerts for movement</p>
                  <p>Trial access includes weekly geo grid refreshes plus notifications when positions shift.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-lg trial-preview-card surface-card surface-card--muted">
            <CardHeader>
              <CardTitle>Start your 7 day Local Paint Pilot trial</CardTitle>
              <CardDescription>
                We&apos;ll create your account and unlock the full dashboard experience.
              </CardDescription>
            </CardHeader>
            <CardContent>
                {trialStatus === 'success' ? (
                  <div className="space-y-3 rounded-md border border-emerald-400/60 bg-emerald-500/10 p-4 text-sm text-emerald-700">
                    <p className="font-semibold">You&apos;re all set!</p>
                    <p>
                      We emailed a verification link. Your 7 day trial is active—feel free to explore the dashboard now while
                      you confirm your email.
                    </p>
                  </div>
                ) : (
                <form className="grid gap-4 md:grid-cols-2" onSubmit={handleTrialSubmit}>
                  <div className="md:col-span-1 space-y-2">
                    <Label htmlFor="trial-email">Work email</Label>
                    <Input id="trial-email" type="email" value={trialEmail} disabled required />
                  </div>
                  <div className="md:col-span-1 space-y-2">
                    <Label htmlFor="trial-password">Password</Label>
                    <Input
                      id="trial-password"
                      type="password"
                      value={trialPassword}
                      onChange={(event) => setTrialPassword(event.target.value)}
                      placeholder="Create a password"
                      autoComplete="new-password"
                      disabled={trialStatus === 'submitting'}
                      required
                    />
                  </div>
                  <div className="md:col-span-2 flex flex-wrap items-center gap-4">
                    <Button type="submit" disabled={trialStatus === 'submitting'}>
                      {trialStatus === 'submitting' ? 'Starting your trial…' : 'Start my free trial'}
                    </Button>
                    {trialError ? (
                      <span className="text-sm text-destructive" role="alert">
                        {trialError}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        We&apos;ll send onboarding resources and confirm your account instantly.
                      </span>
                    )}
                  </div>
                </form>
              )}
            </CardContent>
            {trialStatus !== 'success' ? (
              <CardFooter>
                <p className="text-xs text-muted-foreground">
                  The Free Trial include full access to dashboards, keyword rank tracking, and live operations tooling. No credit card required.
                </p>
              </CardFooter>
            ) : null}
          </Card>

          {activeOpportunity ? (
            <div className="task-overlay" role="presentation">
              <div className="task-overlay__backdrop" onClick={closeOpportunityOverlay} />
              <div
                className="task-overlay__panel"
                role="dialog"
                aria-modal="true"
                aria-labelledby="trial-opportunity-title"
              >
                <div className="task-overlay__header">
                  <div>
                    <h3 id="trial-opportunity-title">{activeOpportunity.label}</h3>
                    {activeOpportunity.status ? (
                      <span className="status-pill" data-status={activeOpportunity.status.key}>
                        {activeOpportunity.status.label}
                      </span>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="task-overlay__close"
                    aria-label="Close details"
                    onClick={closeOpportunityOverlay}
                  >
                    ×
                  </button>
                </div>

                <div className="task-overlay__detail">
                  <div className="task-overlay__summary">
                    <p>Create your account to get details for this optimization step.</p>
                    {activeOpportunity.detail ? <p>{activeOpportunity.detail}</p> : null}
                  </div>
                </div>

                <div className="task-overlay__content">
                  <div className="trial-preview__overlay-message">
                    <p>
                      Start a free trial to unlock the full step-by-step guide, templates, and tracking inside your dashboard.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
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
