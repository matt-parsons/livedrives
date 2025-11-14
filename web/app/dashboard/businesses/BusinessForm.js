'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const MIN_QUERY_LENGTH = 3;
const SEARCH_DEBOUNCE_MS = 500;

function classNames(...tokens) {
  return tokens.filter(Boolean).join(' ');
}

function toInputString(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value);
}

function nullIfEmpty(value) {
  return value === null || value === undefined || value === '' ? null : value;
}

function slugify(value) {
  if (!value) {
    return '';
  }

  return value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function derivePlaceValuesFromPlace(place, prevState) {
  const location = place.location ?? {};
  const latValue =
    location.lat ?? location.latitude ?? place.sidebar?.latitude ?? null;
  const lngValue =
    location.lng ?? location.longitude ?? place.sidebar?.longitude ?? null;
  const nextSlug = slugify(place.name ?? '');
  const derivedMid = place.sidebar?.mid ?? place.sidebar?.cid ?? place.cid ?? null;
  const placeId = place.placeId ?? place.place_id ?? null;

  return {
    ...prevState,
    businessName: place.name ?? prevState.businessName,
    businessSlug: nextSlug || prevState.businessSlug,
    brandSearch: place.name ?? prevState.brandSearch,
    destinationAddress: place.formattedAddress ?? prevState.destinationAddress,
    destinationZip: place.postalCode ?? prevState.destinationZip,
    destLat:
      latValue !== undefined && latValue !== null ? String(latValue) : prevState.destLat,
    destLng:
      lngValue !== undefined && lngValue !== null ? String(lngValue) : prevState.destLng,
    timezone: place.timezone ?? prevState.timezone,
    gPlaceId: placeId ?? prevState.gPlaceId,
    mid: derivedMid ? String(derivedMid) : prevState.mid,
    drivesPerDay: prevState.drivesPerDay || '5'
  };
}

export default function BusinessForm({ mode = 'create', businessId = null, initialValues = {} }) {
  const router = useRouter();
  const [formState, setFormState] = useState(() => {
    const defaultDrivesPerDay =
      initialValues.drivesPerDay !== undefined && initialValues.drivesPerDay !== null
        ? initialValues.drivesPerDay
        : mode === 'create'
          ? 5
          : '';

    return {
      businessName: initialValues.businessName ?? '',
      businessSlug: initialValues.businessSlug ?? '',
      brandSearch: initialValues.brandSearch ?? '',
      mid: initialValues.mid ?? '',
      destinationAddress: initialValues.destinationAddress ?? '',
      destinationZip: initialValues.destinationZip ?? '',
      destLat: toInputString(initialValues.destLat),
      destLng: toInputString(initialValues.destLng),
      timezone: initialValues.timezone ?? '',
      drivesPerDay: toInputString(defaultDrivesPerDay),
      gPlaceId: initialValues.gPlaceId ?? '',
      isActive: typeof initialValues.isActive === 'boolean'
        ? initialValues.isActive
        : initialValues.isActive === undefined
          ? true
          : Boolean(initialValues.isActive)
    };
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [placesQuery, setPlacesQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [lookupState, setLookupState] = useState('idle');
  const [lookupError, setLookupError] = useState('');
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [phase, setPhase] = useState('search');
  const [gatheringData, setGatheringData] = useState(false);
  const [gatheringMessage, setGatheringMessage] = useState('');

  const handlePlacesQueryChange = (event) => {
    setPlacesQuery(event.target.value);
    setPhase('search');
    setLookupState('idle');
    setLookupError('');
  };

  useEffect(() => {
    if (phase !== 'search') {
      return;
    }

    const query = placesQuery.trim();
    if (query.length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setLookupError('');
      setLookupState('idle');
      setActiveSuggestionIndex(-1);
      return;
    }

    const controller = new AbortController();
    const handler = setTimeout(async () => {
      setLookupState('loading');
      setLookupError('');

      try {
        const response = await fetch(`/api/places/search?query=${encodeURIComponent(query)}`, {
          signal: controller.signal
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || 'Search request failed.');
        }

        const payload = await response.json();
        const results = Array.isArray(payload.results) ? payload.results : [];

        setSuggestions(results);
        if (results.length) {
          setLookupState('success');
          setActiveSuggestionIndex(0);
          setLookupError('');
        } else {
          setLookupState('empty');
          setActiveSuggestionIndex(-1);
          setLookupError('No places matched your search. Try refining the query.');
        }
      } catch (err) {
        if (controller.signal.aborted) {
          return;
        }

        console.error('Places search failed', err);
        setLookupState('error');
        setLookupError(err.message || 'Failed to search for places.');
        setSuggestions([]);
        setActiveSuggestionIndex(-1);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(handler);
      controller.abort();
    };
  }, [phase, placesQuery]);

  const handleLookupKeyDown = (event) => {
    if (phase !== 'search' || !suggestions.length) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveSuggestionIndex((index) => (index + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveSuggestionIndex((index) => (index - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const selected =
        activeSuggestionIndex >= 0 ? suggestions[activeSuggestionIndex] : suggestions[0];
      if (selected) {
        handleAddBusiness(selected.placeId);
      }
    }
  };

  const buildPayloadFromValues = (values) => ({
    businessName: values.businessName.trim(),
    businessSlug: nullIfEmpty(values.businessSlug.trim()),
    brandSearch: nullIfEmpty(values.brandSearch.trim()),
    mid: nullIfEmpty(values.mid.trim()),
    destinationAddress: nullIfEmpty(values.destinationAddress.trim()),
    destinationZip: nullIfEmpty(values.destinationZip.trim()),
    destLat: nullIfEmpty(values.destLat.trim()),
    destLng: nullIfEmpty(values.destLng.trim()),
    timezone: nullIfEmpty(values.timezone.trim()),
    drivesPerDay: nullIfEmpty(values.drivesPerDay.trim()),
    gPlaceId: nullIfEmpty(values.gPlaceId.trim()),
    isActive: values.isActive
  });

  const submitBusiness = async (values) => {
    setSubmitting(true);
    setError('submitBusiness');
    const payload = buildPayloadFromValues(values);
    const endpoint = mode === 'edit' ? `/api/businesses/${businessId}` : '/api/businesses';
    const method = mode === 'edit' ? 'PATCH' : 'POST';

    try {
      const response = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json().catch(() => ({}));
      console.log(data);

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save business.');
      }

      const business = data.business;
      console.log(business);
      if (!business || (business.id === undefined && business.businessSlug === undefined)) {
        throw new Error('API response was missing business details.');
      }

      const targetIdentifier = business.businessSlug ?? business.id;
      router.push(`/dashboard/${encodeURIComponent(targetIdentifier)}`);
      router.refresh();
    } catch (err) {
      setError(err.message || 'Failed to save business.');
      setSubmitting(false);
      throw err;
    }
  };

  const handleSubmit = async (event) => {
    if (event && typeof event.preventDefault === 'function') {
      event.preventDefault();
    }
    try {
      await submitBusiness(formState);
    } catch {
      // Error state already handled inside submitBusiness
    }
  };

  const handleAddBusiness = async (placeId) => {
    if (!placeId || gatheringData || submitting) {
      return;
    }

    setPhase('loading');
    setGatheringData(true);
    setGatheringMessage('Gathering your business data…');
    setLookupError('');

    try {
      const response = await fetch(`/api/places/${encodeURIComponent(placeId)}`);
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load place details.');
      }

      if (!data.place) {
        throw new Error('Place details were missing in the response.');
      }

      let derivedState = derivePlaceValuesFromPlace(data.place, formState);
      const timezoneFromPlace = await resolveTimezoneFromPlace(data.place);
      if (timezoneFromPlace) {
        derivedState = { ...derivedState, timezone: timezoneFromPlace };
      }

      setFormState(derivedState);
      setSuggestions([]);
      setActiveSuggestionIndex(-1);
      setLookupState('idle');
      setLookupError('');
      setPlacesQuery('');

      await submitBusiness(derivedState);
    } catch (err) {
      setLookupError(err.message || 'Failed to load place details.');
    } finally {
      setGatheringData(false);
      setGatheringMessage('');
      setPhase('search');
    }
  };

  return (
    <form className="grid gap-6" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <Label htmlFor="places-query">Search Google Places</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="places-query"
            type="text"
            value={placesQuery}
            onChange={handlePlacesQueryChange}
            onKeyDown={handleLookupKeyDown}
            disabled={submitting || gatheringData}
            placeholder="Search by business name or address"
            autoComplete="off"
            className="sm:flex-1"
          />
        </div>
        <p className="text-xs text-muted-foreground">Select a result to automatically fill in the business details.</p>
        {lookupState === 'loading' && !gatheringData ? (
          <p className="text-sm text-muted-foreground">Loading suggestions…</p>
        ) : null}
        {gatheringData && gatheringMessage ? (
          <p className="text-sm text-muted-foreground">{gatheringMessage}</p>
        ) : null}
        {lookupError && lookupState !== 'loading' ? (
          <p className="text-sm text-destructive" role="alert">
            {lookupError}
          </p>
        ) : null}
      </div>

      {suggestions.length > 0 ? (
        <div className="space-y-3">
          <span className="text-sm font-semibold text-muted-foreground">Search results</span>
          <div className="grid gap-3">
            {suggestions.map((place, index) => {
              const isActive = index === activeSuggestionIndex;
              return (
                <div
                  key={place.placeId}
                  className={classNames(
                    'rounded-lg border border-border bg-card/80 p-4 shadow-sm transition',
                    isActive ? 'ring-2 ring-secondary ring-offset-2 ring-offset-background' : ''
                  )}
                  onMouseEnter={() => setActiveSuggestionIndex(index)}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-semibold text-foreground">{place.name}</p>
                      {place.formattedAddress ? (
                        <p className="text-sm text-muted-foreground">{place.formattedAddress}</p>
                      ) : null}
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => handleAddBusiness(place.placeId)}
                      disabled={submitting || lookupState === 'loading' || gatheringData}
                    >
                      {gatheringData ? 'Adding…' : 'Add this business'}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </form>

  );
}
