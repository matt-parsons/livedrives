'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

export default function RegisterPage() {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [lookupState, setLookupState] = useState('idle');
  const [lookupError, setLookupError] = useState('');
  const [selectedPlace, setSelectedPlace] = useState(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [leadId, setLeadId] = useState(null);

  const inputRef = useRef(null);
  const isSubmitting = status === 'submitting';
  const isComplete = status === 'success';

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setSuggestions([]);
      setLookupState('idle');
      setLookupError('');
      setActiveIndex(-1);
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
      } catch (lookupErr) {
        if (controller.signal.aborted) {
          return;
        }

        console.error('Places lookup failed', lookupErr);
        setLookupState('error');
        setLookupError(lookupErr.message || 'Unable to search Google Places right now.');
      }
    }, 300);

    return () => {
      clearTimeout(handler);
      controller.abort();
    };
  }, [query]);

  const namePlaceholder = useMemo(() => {
    if (name.trim()) return name.trim();
    if (!email) return 'Ada Lovelace';
    const localPart = email.split('@')[0] ?? '';
    if (!localPart) return 'Ada Lovelace';
    return localPart
      .split(/[._-]/)
      .filter(Boolean)
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(' ');
  }, [email, name]);

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

  const handleSubmit = useCallback(
    async (event) => {
      event.preventDefault();
      setError('');
      setLookupError('');

      const chosenSuggestion = selectedPlace || (activeIndex >= 0 ? suggestions[activeIndex] : suggestions[0]);

      if (!chosenSuggestion?.placeId) {
        setLookupError('Choose a Google Business Profile from the suggestions to continue.');
        setLookupState('error');
        return;
      }

      const trimmedEmail = email.trim().toLowerCase();
      if (!emailPattern.test(trimmedEmail)) {
        setError('Please provide a valid work email so we can send verification.');
        return;
      }

      setStatus('submitting');

      try {
        const leadResponse = await fetch('/api/funnel/lead', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: trimmedEmail,
            place: {
              placeId: chosenSuggestion.placeId,
              name: chosenSuggestion.name,
              formattedAddress: chosenSuggestion.formattedAddress,
              location: chosenSuggestion.location
            }
          })
        });

        const leadPayload = await leadResponse.json().catch(() => ({}));
        if (!leadResponse.ok || !leadPayload?.leadId) {
          throw new Error(leadPayload.error || 'Unable to save your business selection right now.');
        }

        setLeadId(leadPayload.leadId);

        const registerResponse = await fetch('/api/public/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim() || chosenSuggestion.name || '',
            email: trimmedEmail
          })
        });

        const registerPayload = await registerResponse.json().catch(() => ({}));
        if (!registerResponse.ok || !registerPayload?.success) {
          throw new Error(registerPayload.error || 'Registration failed. Please try again.');
        }

        setSelectedPlace(chosenSuggestion);
        setStatus('success');
      } catch (err) {
        console.error('Registration flow failed', err);
        setStatus('idle');
        setError(err.message || 'Unable to submit registration right now.');
      }
    },
    [activeIndex, email, name, selectedPlace, suggestions]
  );

  return (
    <div className="page-shell">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 lg:grid lg:grid-cols-[1.1fr_1fr] lg:items-start">
        <section className="space-y-4 rounded-xl border border-border/60 bg-card/80 p-8 shadow-sm backdrop-blur">
          <span className="inline-flex items-center rounded-full border border-secondary/40 bg-secondary/10 px-3 py-1 text-xs font-medium uppercase tracking-wide text-secondary-foreground">
            New: Direct registration
          </span>
          <h1 className="text-3xl font-semibold text-foreground">Create your Local Paint Pilot account</h1>
          <p className="text-base leading-relaxed text-muted-foreground">
            Search for your Google Business Profile, tell us who&apos;s signing up, and we&apos;ll email a Firebase verification link
            instantly. After you confirm, you&apos;ll land in the same onboarding flow as the preview experience.
          </p>
          <div className="rounded-lg border border-border/60 bg-background/80 p-4 text-sm text-muted-foreground">
            <p className="font-semibold text-foreground">What to expect</p>
            <ul className="mt-2 list-disc space-y-2 pl-5">
              <li>Select your GBP so we can pre-load your workspace context.</li>
              <li>We&apos;ll send the Firebase auth email right away—no preview step required.</li>
              <li>Once you click the email link, you&apos;ll continue through the standard onboarding.</li>
            </ul>
          </div>
        </section>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl">Find your GBP &amp; register</CardTitle>
            <CardDescription>
              Search Google Places, pick your business, and start the email verification process in one step.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
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
                disabled={isSubmitting || isComplete}
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
              <p className="rounded-md border border-border/60 bg-muted/10 px-3 py-2 text-sm text-muted-foreground">
                No Google Places results found. Try adjusting the business name.
              </p>
            ) : null}

            {suggestions.length ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Select your business</p>
                <div className="grid gap-2">
                  {suggestions.map((suggestion, index) => (
                    <LookupSuggestion
                      key={suggestion.placeId || suggestion.name || index}
                      suggestion={suggestion}
                      isActive={
                        (selectedPlace?.placeId && selectedPlace.placeId === suggestion.placeId) || index === activeIndex
                      }
                      onSelect={(value) => {
                        setSelectedPlace(value);
                        setQuery(value.name || '');
                        setLookupError('');
                        setLookupState('success');
                        setActiveIndex(index);
                      }}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {selectedPlace ? (
              <div className="rounded-md border border-secondary/40 bg-secondary/10 px-3 py-2 text-xs text-secondary-foreground">
                Selected: {selectedPlace.name || 'Google Business Profile'}
                {selectedPlace.formattedAddress ? ` · ${selectedPlace.formattedAddress}` : ''}
              </div>
            ) : null}

            {isComplete ? (
              <div className="space-y-3 rounded-md border border-emerald-400/60 bg-emerald-500/10 p-4 text-sm text-emerald-700">
                <p className="font-semibold">Check your email to confirm</p>
                <p>
                  We sent a Firebase authentication email to <strong>{email}</strong>. Click the link to finish onboarding
                  with your selected business.
                </p>
                {leadId ? (
                  <p className="text-xs text-emerald-800">We saved your lead ID for this onboarding: {leadId}.</p>
                ) : null}
              </div>
            ) : (
              <form className="space-y-6" onSubmit={handleSubmit} noValidate>
                <div className="space-y-2">
                  <Label htmlFor="name">Your name</Label>
                  <Input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder={namePlaceholder}
                    autoComplete="name"
                    disabled={isSubmitting}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Work email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@company.com"
                    autoComplete="email"
                    required
                    disabled={isSubmitting}
                  />
                </div>

                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? 'Submitting…' : 'Send my verification email'}
                </Button>
              </form>
            )}
          </CardContent>

          {!isComplete && (
            <CardFooter>
              {error ? (
                <p
                  role="alert"
                  className="w-full rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  {error}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  We&apos;ll email verification details immediately and queue your GBP for onboarding after you confirm.
                </p>
              )}
            </CardFooter>
          )}
        </Card>
      </div>
    </div>
  );
}
