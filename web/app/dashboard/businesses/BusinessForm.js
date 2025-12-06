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

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DEFAULT_HOURS = {
  sun: [{ open: '09:00', close: '21:00' }],
  mon: [{ open: '09:00', close: '21:00' }],
  tue: [{ open: '09:00', close: '21:00' }],
  wed: [{ open: '09:00', close: '21:00' }],
  thu: [{ open: '09:00', close: '21:00' }],
  fri: [{ open: '09:00', close: '21:00' }],
  sat: [{ open: '09:00', close: '21:00' }]
};

function formatTimeString(raw) {
  const str = typeof raw === 'string' ? raw.trim() : '';
  if (str.length === 4) {
    return `${str.slice(0, 2)}:${str.slice(2)}`;
  }

  if (str.length === 5 && str.includes(':')) {
    return str;
  }

  return null;
}

function buildHoursFromPlace(place) {
  const windows = DAY_KEYS.reduce((acc, key) => ({ ...acc, [key]: [] }), {});
  const periods = place?.openingHours?.periods;

  if (Array.isArray(periods)) {
    for (const period of periods) {
      const openDay = period?.open?.day;
      const closeDay = period?.close?.day ?? openDay;
      const openTime = formatTimeString(period?.open?.time);
      const closeTime = formatTimeString(period?.close?.time);

      if (
        openDay === undefined ||
        closeDay === undefined ||
        openTime === null ||
        closeTime === null ||
        openDay !== closeDay ||
        openDay < 0 ||
        openDay > 6
      ) {
        continue;
      }

      const key = DAY_KEYS[openDay];
      windows[key].push({ open: openTime, close: closeTime });
    }
  }

  const hasProvidedHours = Object.values(windows).some((segments) => segments.length > 0);
  return hasProvidedHours ? windows : DEFAULT_HOURS;
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

export default function BusinessForm({
  mode = 'create',
  businessId = null,
  initialValues = {},
  showPlaceSearch = mode !== 'edit',
  searchOnly = false,
  redirectPath = null
}) {
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
  const [selectedPlace, setSelectedPlace] = useState(null);
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
    if (!showPlaceSearch) {
      return;
    }

    setPlacesQuery(event.target.value);
    setPhase('search');
    setLookupState('idle');
    setLookupError('');
    setSelectedPlace(null);
  };

  useEffect(() => {
    if (!showPlaceSearch || phase !== 'search') {
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
  }, [phase, placesQuery, showPlaceSearch]);

  const handleLookupKeyDown = (event) => {
    if (!showPlaceSearch || phase !== 'search' || !suggestions.length) {
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
        setSelectedPlace(selected);
        handleAddBusiness(selected.placeId, selected);
      }
    }
  };

  const saveBusinessHours = async (businessId, place) => {
    if (!businessId || !place) {
      return;
    }

    const hours = buildHoursFromPlace(place);

    try {
      const response = await fetch(`/api/businesses/${businessId}/business-hours`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hours })
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        console.warn('Failed to save business hours', data.error || response.statusText);
      }
    } catch (hoursError) {
      console.warn('Error persisting business hours', hoursError);
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
    setError('');
    console.log('submitBusiness start', { mode, businessId, values });
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
      console.log('submitBusiness response', { status: response.status, data });

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save business.');
      }

      const business = data.business;
      console.log(business);
      if (!business || (business.id === undefined && business.businessSlug === undefined)) {
        throw new Error('API response was missing business details.');
      }

      const targetIdentifier = business.businessSlug ?? business.id;
      const destination = redirectPath || `/dashboard/${encodeURIComponent(targetIdentifier)}`;

      if (redirectPath) {
        setSubmitting(false);
      }

      router.push(destination);
      router.refresh();

      return business;
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
    if (searchOnly) {
      const selected = selectedPlace || (activeSuggestionIndex >= 0 ? suggestions[activeSuggestionIndex] : suggestions[0]);
      if (selected?.placeId) {
        await handleAddBusiness(selected.placeId, selected);
      } else {
        setLookupError('Select a Google Business Profile to continue.');
        setLookupState('error');
      }
      return;
    }
    try {
      await submitBusiness(formState);
    } catch {
      // Error state already handled inside submitBusiness
    }
  };

  const handleAddBusiness = async (placeId, suggestion = null) => {
    if (!showPlaceSearch || !placeId || gatheringData || submitting) {
      return;
    }

    setPhase('loading');
    setGatheringData(true);
    setGatheringMessage('Gathering your business data…');
    setLookupError('');
    setSelectedPlace(suggestion);

    try {
      console.log('handleAddBusiness fetching', placeId);
      const response = await fetch(`/api/places/${encodeURIComponent(placeId)}`);
      const data = await response.json().catch(() => ({}));
      console.log('handleAddBusiness response', { status: response.status, data });

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load place details.');
      }

      if (!data.place) {
        throw new Error('Place details were missing in the response.');
      }

      let derivedState = derivePlaceValuesFromPlace(data.place, formState);
      console.log('handleAddBusiness derivedState', derivedState);

      setFormState(derivedState);
      setSuggestions([]);
      setActiveSuggestionIndex(-1);
      setLookupState('idle');
      setLookupError('');
      setPlacesQuery('');

      const business = await submitBusiness(derivedState);
      if (business?.id) {
        await saveBusinessHours(business.id, data.place);
      }
    } catch (err) {
      setLookupError(err.message || 'Failed to load place details.');
      setLookupState('error');
    } finally {
      setGatheringData(false);
      setGatheringMessage('');
      setPhase('search');
    }
  };

  const handleInputChange = (field) => (event) => {
    const value = event.target.value;
    setFormState((prev) => ({ ...prev, [field]: value }));
  };

  const handleIsActiveChange = (event) => {
    const value = event.target.value;
    const nextIsActive = value === 'active';

    setFormState((prev) => ({ ...prev, isActive: nextIsActive }));
  };

  return (
    <form className="grid gap-8" onSubmit={handleSubmit}>
      {showPlaceSearch ? (
        <div className="grid gap-4">
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
                          onClick={() => handleAddBusiness(place.placeId, place)}
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
        </div>
      ) : null}

      {searchOnly ? (
        <div className="hidden" aria-hidden>
          <input type="hidden" name="businessName" value={formState.businessName} readOnly />
          <input type="hidden" name="businessSlug" value={formState.businessSlug} readOnly />
          <input type="hidden" name="brandSearch" value={formState.brandSearch} readOnly />
          <input type="hidden" name="mid" value={formState.mid} readOnly />
          <input
            type="hidden"
            name="destinationAddress"
            value={formState.destinationAddress}
            readOnly
          />
          <input type="hidden" name="destinationZip" value={formState.destinationZip} readOnly />
          <input type="hidden" name="destLat" value={formState.destLat} readOnly />
          <input type="hidden" name="destLng" value={formState.destLng} readOnly />
          <input type="hidden" name="timezone" value={formState.timezone} readOnly />
          <input type="hidden" name="drivesPerDay" value={formState.drivesPerDay} readOnly />
          <input type="hidden" name="gPlaceId" value={formState.gPlaceId} readOnly />
          <input type="hidden" name="isActive" value={formState.isActive ? 'true' : 'false'} readOnly />
        </div>
      ) : (
        <div className="grid gap-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="business-name">Business name</Label>
              <Input
                id="business-name"
                value={formState.businessName}
                onChange={handleInputChange('businessName')}
                required
                placeholder="Acme Painting"
                disabled={submitting}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="business-slug">Slug</Label>
              <Input
                id="business-slug"
                value={formState.businessSlug}
                onChange={handleInputChange('businessSlug')}
                placeholder="acme-painting"
                disabled={submitting}
              />
              <p className="text-xs text-muted-foreground">Optional: short identifier used in URLs.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="brand-search">Brand search term</Label>
              <Input
                id="brand-search"
                value={formState.brandSearch}
                onChange={handleInputChange('brandSearch')}
                placeholder="Acme Painting near me"
                disabled={submitting}
              />
              <p className="text-xs text-muted-foreground">Used when constructing ranking and CTR keywords.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="mid">MID</Label>
              <Input
                id="mid"
                value={formState.mid}
                onChange={handleInputChange('mid')}
                placeholder="Map marker ID"
                disabled={submitting}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="destination-address">Destination address</Label>
              <Input
                id="destination-address"
                value={formState.destinationAddress}
                onChange={handleInputChange('destinationAddress')}
                placeholder="123 Main St"
                disabled={submitting}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="destination-zip">Destination ZIP / postal</Label>
              <Input
                id="destination-zip"
                value={formState.destinationZip}
                onChange={handleInputChange('destinationZip')}
                placeholder="90210"
                disabled={submitting}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dest-lat">Destination latitude</Label>
              <Input
                id="dest-lat"
                value={formState.destLat}
                onChange={handleInputChange('destLat')}
                inputMode="decimal"
                placeholder="34.10000"
                disabled={submitting}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dest-lng">Destination longitude</Label>
              <Input
                id="dest-lng"
                value={formState.destLng}
                onChange={handleInputChange('destLng')}
                inputMode="decimal"
                placeholder="-118.32500"
                disabled={submitting}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Input
                id="timezone"
                value={formState.timezone}
                onChange={handleInputChange('timezone')}
                placeholder="America/Los_Angeles"
                disabled={submitting}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="drives-per-day">Drives per day</Label>
              <Input
                id="drives-per-day"
                type="number"
                min="0"
                value={formState.drivesPerDay}
                onChange={handleInputChange('drivesPerDay')}
                placeholder="5"
                disabled={submitting}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="is-active">Status</Label>
              <select
                id="is-active"
                value={formState.isActive ? 'active' : 'inactive'}
                onChange={handleIsActiveChange}
                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={submitting}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              <p className="text-xs text-muted-foreground">Inactive businesses pause scheduled activity.</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="gplace-id">Google Place ID</Label>
              <Input
                id="gplace-id"
                value={formState.gPlaceId}
                onChange={handleInputChange('gPlaceId')}
                placeholder="ChIJ..."
                disabled={submitting}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes-helper">Notes</Label>
              <p id="notes-helper" className="text-xs text-muted-foreground">
                Keep this in sync with your live Google Business Profile identifiers.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {!searchOnly ? (
        <div className="flex justify-end">
          <Button type="submit" disabled={submitting || gatheringData}>
            {submitting ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Create business'}
          </Button>
        </div>
      ) : null}
    </form>

  );
}
