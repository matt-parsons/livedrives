'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
  const [placesResults, setPlacesResults] = useState([]);
  const [placesError, setPlacesError] = useState('');
  const [placesLoading, setPlacesLoading] = useState(false);

  const title = useMemo(() => (mode === 'edit' ? 'Save changes' : 'Add Your Business'), [mode]);

  const handlePlacesQueryChange = (event) => {
    setPlacesQuery(event.target.value);
  };

  const prefillFromPlace = (place) => {
    if (!place) {
      return;
    }

    const location = place.location ?? {};
    const latValue =
      location.lat ??
      location.latitude ??
      place.sidebar?.latitude ??
      null;
    const lngValue =
      location.lng ??
      location.longitude ??
      place.sidebar?.longitude ??
      null;
    const nextSlug = slugify(place.name ?? '');
    const derivedMid = place.sidebar?.mid ?? place.sidebar?.cid ?? place.cid ?? null;
    const placeId = place.placeId ?? place.place_id ?? null;

    setFormState((prev) => ({
      ...prev,
      businessName: place.name ?? prev.businessName,
      businessSlug: nextSlug || prev.businessSlug,
      brandSearch: place.name ?? prev.brandSearch,
      destinationAddress: place.formattedAddress ?? prev.destinationAddress,
      destinationZip: place.postalCode ?? prev.destinationZip,
      destLat: latValue !== undefined && latValue !== null ? String(latValue) : prev.destLat,
      destLng: lngValue !== undefined && lngValue !== null ? String(lngValue) : prev.destLng,
      timezone: place.timezone ?? prev.timezone,
      gPlaceId: placeId ?? prev.gPlaceId,
      mid: derivedMid ? String(derivedMid) : prev.mid,
      drivesPerDay: prev.drivesPerDay || '5'
    }));
  };

  const handlePlaceSearch = async (event) => {
    event.preventDefault();

    const query = placesQuery.trim();
    if (!query) {
      setPlacesResults([]);
      setPlacesError('Enter a business name, address, or keyword to search.');
      return;
    }

    setPlacesLoading(true);
    setPlacesError('');

    try {
      const response = await fetch(`/api/places/search?query=${encodeURIComponent(query)}`);
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'Search request failed.');
      }

      const results = Array.isArray(data.results) ? data.results : [];
      setPlacesResults(results);

      if (results.length === 0) {
        setPlacesError('No places matched your search. Try refining the query.');
      }
    } catch (err) {
      setPlacesError(err.message || 'Failed to search for places.');
      setPlacesResults([]);
    } finally {
      setPlacesLoading(false);
    }
  };

  const handleSelectPlace = async (placeId) => {
    if (!placeId) {
      return;
    }

    setPlacesLoading(true);
    setPlacesError('');

    try {
      const response = await fetch(`/api/places/${encodeURIComponent(placeId)}`);
      const data = await response.json().catch(() => ({}));
      console.log(data);

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load place details.');
      }

      if (!data.place) {
        throw new Error('Place details were missing in the response.');
      }

      prefillFromPlace(data.place);
      setPlacesResults([]);
      setPlacesQuery(data.place.name ?? '');
    } catch (err) {
      setPlacesError(err.message || 'Failed to load place details.');
    } finally {
      setPlacesLoading(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');

    const payload = {
      businessName: formState.businessName.trim(),
      businessSlug: nullIfEmpty(formState.businessSlug.trim()),
      brandSearch: nullIfEmpty(formState.brandSearch.trim()),
      mid: nullIfEmpty(formState.mid.trim()),
      destinationAddress: nullIfEmpty(formState.destinationAddress.trim()),
      destinationZip: nullIfEmpty(formState.destinationZip.trim()),
      destLat: nullIfEmpty(formState.destLat.trim()),
      destLng: nullIfEmpty(formState.destLng.trim()),
      timezone: nullIfEmpty(formState.timezone.trim()),
      drivesPerDay: nullIfEmpty(formState.drivesPerDay.trim()),
      gPlaceId: nullIfEmpty(formState.gPlaceId.trim()),
      isActive: formState.isActive
    };

    const endpoint = mode === 'edit' ? `/api/businesses/${businessId}` : '/api/businesses';
    const method = mode === 'edit' ? 'PATCH' : 'POST';

    try {
      const response = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save business.');
      }

      const business = data.business;
      if (!business || (business.id === undefined && business.businessSlug === undefined)) {
        throw new Error('API response was missing business details.');
      }

      const targetIdentifier = business.businessSlug ?? business.id;
      router.push(`/dashboard/${encodeURIComponent(targetIdentifier)}`);
      router.refresh();
    } catch (err) {
      setError(err.message || 'Failed to save business.');
      setSubmitting(false);
    }
  };

  const hasSelectedPlace = Boolean(formState.businessName || formState.destinationAddress);

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
            disabled={submitting || placesLoading}
            placeholder="Search by business name or address"
            autoComplete="off"
            className="sm:flex-1"
          />
          <Button
            type="button"
            variant="secondary"
            onClick={handlePlaceSearch}
            disabled={submitting || placesLoading}
          >
            {placesLoading ? 'Loading…' : 'Search'}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Select a result to automatically fill in the business details.</p>
        {placesError ? <p className="text-sm text-destructive" role="alert">{placesError}</p> : null}
      </div>

      {placesResults.length > 0 ? (
        <div className="space-y-3">
          <span className="text-sm font-semibold text-muted-foreground">Search results</span>
          <div className="grid gap-3">
            {placesResults.map((place) => (
              <div key={place.placeId} className="rounded-lg border border-border bg-card/80 p-4 shadow-sm">
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
                    onClick={() => handleSelectPlace(place.placeId)}
                    disabled={submitting || placesLoading}
                  >
                    Use this place
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {hasSelectedPlace ? (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Selected business</Label>
            <div className="rounded-lg border border-border bg-muted/40 p-4">
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Business name
                  </p>
                  <p className="text-lg font-medium text-foreground">
                    {formState.businessName || 'No business selected yet'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Address
                  </p>
                  <p className="text-base text-foreground">
                    {formState.destinationAddress || 'No address selected yet'}
                  </p>
                </div>
              </div>
              <p className="mt-4 text-sm text-muted-foreground">
                Is this the business you’d like to add? Click below to confirm.
              </p>
            </div>
          </div>
          <input type="hidden" name="businessSlug" value={formState.businessSlug} readOnly />
          <input type="hidden" name="gPlaceId" value={formState.gPlaceId} readOnly />
        </div>
      ) : null}
      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={submitting}>
        {submitting ? 'Saving...' : title}
      </Button>
    </form>

  );
}
