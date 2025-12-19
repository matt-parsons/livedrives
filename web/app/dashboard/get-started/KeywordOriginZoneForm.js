'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

function extractKeywordTerms(raw) {
  if (!raw) {
    return [];
  }

  const terms = [];

  const addTerm = (value) => {
    if (value === null || value === undefined) {
      return;
    }

    const str = String(value).trim();

    if (str) {
      terms.push(str);
    }
  };

  const consumeArray = (list) => {
    for (const entry of list) {
      if (!entry && entry !== 0) {
        continue;
      }

      if (typeof entry === 'string' || typeof entry === 'number') {
        addTerm(entry);
        continue;
      }

      if (typeof entry === 'object') {
        addTerm(entry.term ?? entry.keyword ?? entry.value ?? entry.name ?? entry.label);
      }
    }
  };

  if (typeof raw === 'string') {
    const trimmed = raw.trim();

    if (!trimmed) {
      return [];
    }

    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);

        if (Array.isArray(parsed)) {
          consumeArray(parsed);
          return Array.from(new Set(terms));
        }
      } catch {
        // fall back to delimiter parsing
      }
    }

    trimmed
      .split(/[,;\n]+/)
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach(addTerm);

    return Array.from(new Set(terms));
  }

  if (Array.isArray(raw)) {
    consumeArray(raw);
    return Array.from(new Set(terms));
  }

  if (typeof raw === 'object') {
    addTerm(raw.term ?? raw.keyword ?? raw.value ?? raw.name ?? raw.label);
  }

  return Array.from(new Set(terms));
}

function formatCoordinate(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return String(value);
  }

  return number.toFixed(5);
}

export default function KeywordOriginZoneForm({
  businessId,
  businessName,
  destinationAddress,
  destinationZip,
  destLat,
  destLng,
  existingZone
}) {
  const router = useRouter();
  const [keyword, setKeyword] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [suggestionStatus, setSuggestionStatus] = useState('idle');
  const [suggestionError, setSuggestionError] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let isActive = true;
    const cacheKey = `keywordSuggestions:${businessId}`;

    const cachedPayload = (() => {
      try {
        const raw = localStorage.getItem(cacheKey);

        if (!raw) {
          return null;
        }

        const parsed = JSON.parse(raw);

        if (!Array.isArray(parsed?.suggestions)) {
          return null;
        }

        return parsed;
      } catch {
        return null;
      }
    })();

    if (cachedPayload) {
      setSuggestions(cachedPayload.suggestions);
      setSuggestionError(cachedPayload.error || '');
      setSuggestionStatus(cachedPayload.suggestions.length ? 'ready' : 'empty');

      return () => {
        isActive = false;
      };
    }

    const fetchSuggestions = async () => {
      setSuggestionStatus('loading');
      setSuggestionError('');

      try {
        const response = await fetch(`/api/businesses/${businessId}/keyword-suggestions`);
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(payload.error || 'Failed to load keyword ideas.');
        }

        const normalized = Array.isArray(payload.suggestions) ? payload.suggestions : [];

        if (!isActive) {
          return;
        }

        setSuggestions(normalized);
        setSuggestionStatus(normalized.length ? 'ready' : 'empty');

        try {
          localStorage.setItem(cacheKey, JSON.stringify({ suggestions: normalized }));
        } catch {
          // Ignore caching failures so we don't block the UX.
        }
      } catch (err) {
        if (!isActive) {
          return;
        }

        setSuggestionStatus('error');
        setSuggestionError(err.message || 'Failed to load keyword ideas.');
      }
    };

    fetchSuggestions();

    return () => {
      isActive = false;
    };
  }, [businessId]);

  const formattedKeywords = useMemo(() => {
    if (!existingZone?.keywords) {
      return '—';
    }

    const terms = extractKeywordTerms(existingZone.keywords);

    if (!terms.length) {
      return String(existingZone.keywords);
    }

    return terms.join(', ');
  }, [existingZone]);

  if (existingZone) {
    const coordLabel = existingZone.lat !== null && existingZone.lng !== null
      ? `${formatCoordinate(existingZone.lat)}, ${formatCoordinate(existingZone.lng)}`
      : null;

    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-lg border border-border/70 bg-muted/40 p-4 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Origin zone created</p>
          <p className="mt-1">
            You&apos;re all set. The keyword <strong>{formattedKeywords}</strong> is tied to
            &quot;{existingZone.name || 'Primary coverage'}&quot; with a {existingZone.radiusMi ?? 0} mile radius.
          </p>
          {coordLabel ? (
            <p className="mt-1">Coordinates: {coordLabel}</p>
          ) : null}
        </div>
      </div>
    );
  }

  const hasCoordinates = Number.isFinite(Number(destLat)) && Number.isFinite(Number(destLng));

  const createOriginZone = async (keywordValue) => {
    setError('');
    setStatus('');

    const trimmed = keywordValue.trim();

    if (!trimmed) {
      setError('Pick one of the suggested keywords or enter your own.');
      return;
    }

    if (!hasCoordinates) {
      setError('Add destination coordinates to your business profile before creating an origin zone.');
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch(`/api/businesses/${businessId}/origin-zones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Initial onboarding zone',
          canonical: destinationAddress || businessName || 'Initial onboarding zone',
          zip: destinationZip || null,
          lat: Number(destLat),
          lng: Number(destLng),
          radiusMi: 3,
          weight: 1,
          keywords: [{ term: trimmed, weight: 1 }]
        })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create origin zone.');
      }

      setKeyword('');
      setStatus('Origin zone created successfully.');
      router.refresh();
    } catch (err) {
      setError(err.message || 'Failed to create origin zone.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSuggestionSelect = (selectedKeyword) => {
    if (submitting) {
      return;
    }

    setKeyword(selectedKeyword);
    createOriginZone(selectedKeyword);
  };

  return (
    <div className="grid gap-4">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="onboarding-keyword">Top keyword picks</Label>
          <span className="text-xs text-muted-foreground">
            {suggestionStatus === 'loading'
              ? ''
              : 'Tap a pick or enter your own keyword'}
          </span>
        </div>

        {suggestionError ? (
          <p className="inline-error" role="alert">
            <strong>Keyword picks unavailable</strong>
            <span>{suggestionError}</span>
          </p>
        ) : null}

        {suggestionStatus === 'empty' ? (
          <p className="rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
            We couldn&apos;t find ready-made picks. Enter a keyword you&apos;d like us to track first.
          </p>
        ) : null}

        {suggestions.length ? (
          <div className="grid gap-3 sm:grid-cols-3">
            {suggestions.map((item, index) => (
              <button
                key={item.keyword}
                type="button"
                onClick={() => handleSuggestionSelect(item.keyword)}
                className="flex h-full flex-col gap-2 rounded-lg border border-border/70 bg-background px-3 py-3 text-left shadow-sm transition hover:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                disabled={submitting}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-foreground">{item.keyword}</span>
                  <span className="text-xs text-muted-foreground">#{index + 1}</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{item.reason}</p>
                <span className="text-xs font-medium text-primary">Use this keyword</span>
              </button>
            ))}
          </div>
        ) : null}
        {suggestionStatus === 'loading' ? (
          <div className="flex min-h-[8rem] flex-col items-center justify-center rounded-lg border border-dashed border-border bg-background p-6 text-center shadow-sm">
            <div className="flex items-center gap-3">
              <LoadingSpinner className="h-5 w-5" />
              <p className="font-medium text-muted-foreground">
                Generating your top search keywords…
              </p>
            </div>
          </div>
        ) : (
          (suggestionStatus === 'ready' || suggestionStatus === 'empty') && (
            <div className="space-y-2">
              <Label htmlFor="onboarding-keyword">Or type your own</Label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  id="onboarding-keyword"
                  type="text"
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  placeholder="e.g. house painter near me"
                  disabled={submitting}
                />
                <Button
                  type="button"
                  onClick={() => createOriginZone(keyword)}
                  disabled={submitting}
                >
                  {submitting ? 'Saving keyword…' : 'Save keyword'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                We&apos;ll auto-create the first origin zone using the business location with a 3
                mile radius.
              </p>
            </div>
          )
        )}
      </div>

      {error ? (
        <p className="inline-error" role="alert">
          <strong>Unable to create zone</strong>
          <span>{error}</span>
        </p>
      ) : null}

      {status ? (
        <p className="rounded-md border border-emerald-400/40 bg-emerald-50 px-3 py-2 text-sm text-emerald-700" role="status">
          {status}
        </p>
      ) : null}
    </div>
  );
}
