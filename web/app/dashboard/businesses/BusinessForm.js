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

export default function BusinessForm({ mode = 'create', businessId = null, initialValues = {} }) {
  const router = useRouter();
  const [formState, setFormState] = useState(() => ({
    businessName: initialValues.businessName ?? '',
    businessSlug: initialValues.businessSlug ?? '',
    brandSearch: initialValues.brandSearch ?? '',
    mid: initialValues.mid ?? '',
    destinationAddress: initialValues.destinationAddress ?? '',
    destinationZip: initialValues.destinationZip ?? '',
    destLat: toInputString(initialValues.destLat),
    destLng: toInputString(initialValues.destLng),
    timezone: initialValues.timezone ?? '',
    drivesPerDay: toInputString(initialValues.drivesPerDay),
    gPlaceId: initialValues.gPlaceId ?? '',
    isActive: typeof initialValues.isActive === 'boolean'
      ? initialValues.isActive
      : initialValues.isActive === undefined
        ? true
        : Boolean(initialValues.isActive)
  }));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [placesQuery, setPlacesQuery] = useState('');
  const [placesResults, setPlacesResults] = useState([]);
  const [placesError, setPlacesError] = useState('');
  const [placesLoading, setPlacesLoading] = useState(false);

  const title = useMemo(() => (mode === 'edit' ? 'Save changes' : 'Create business'), [mode]);

  const handleChange = (field) => (event) => {
    const value = event.target.value;
    setFormState((prev) => ({ ...prev, [field]: value }));
  };

  const handleCheckboxChange = (event) => {
    const { checked } = event.target;
    setFormState((prev) => ({ ...prev, isActive: checked }));
  };

  const handlePlacesQueryChange = (event) => {
    setPlacesQuery(event.target.value);
  };

  const prefillFromPlace = (place) => {
    setFormState((prev) => ({
      ...prev,
      businessName: place.name ?? prev.businessName,
      brandSearch: place.name ?? prev.brandSearch,
      destinationAddress: place.formattedAddress ?? prev.destinationAddress,
      destinationZip: place.postalCode ?? prev.destinationZip,
      destLat: place.location?.lat !== undefined && place.location?.lat !== null
        ? String(place.location.lat)
        : prev.destLat,
      destLng: place.location?.lng !== undefined && place.location?.lng !== null
        ? String(place.location.lng)
        : prev.destLng,
      timezone: place.timezone ?? prev.timezone,
      gPlaceId: place.placeId ?? prev.gPlaceId
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

      <div className="grid gap-4">
        <div className="space-y-2">
          <Label htmlFor="business-name">Business name</Label>
          <Input
            id="business-name"
            type="text"
            value={formState.businessName}
            onChange={handleChange('businessName')}
            required
            disabled={submitting}
            autoComplete="organization"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="business-slug">Slug (optional)</Label>
          <Input
            id="business-slug"
            type="text"
            value={formState.businessSlug}
            onChange={handleChange('businessSlug')}
            disabled={submitting}
            placeholder="auto-generated from business name"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="brand-search">Brand search label (optional)</Label>
          <Input
            id="brand-search"
            type="text"
            value={formState.brandSearch}
            onChange={handleChange('brandSearch')}
            disabled={submitting}
            placeholder="Used for search matching"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="mid">Google MID (optional)</Label>
          <Input
            id="mid"
            type="text"
            value={formState.mid}
            onChange={handleChange('mid')}
            disabled={submitting}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="gplace">Google Place ID (optional)</Label>
          <Input
            id="gplace"
            type="text"
            value={formState.gPlaceId}
            onChange={handleChange('gPlaceId')}
            disabled={submitting}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="destination-address">Destination address (optional)</Label>
          <Input
            id="destination-address"
            type="text"
            value={formState.destinationAddress}
            onChange={handleChange('destinationAddress')}
            disabled={submitting}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="destination-zip">Destination ZIP (optional)</Label>
          <Input
            id="destination-zip"
            type="text"
            value={formState.destinationZip}
            onChange={handleChange('destinationZip')}
            disabled={submitting}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="dest-lat">Destination latitude (optional)</Label>
          <Input
            id="dest-lat"
            type="number"
            inputMode="decimal"
            step="0.0000001"
            value={formState.destLat}
            onChange={handleChange('destLat')}
            disabled={submitting}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="dest-lng">Destination longitude (optional)</Label>
          <Input
            id="dest-lng"
            type="number"
            inputMode="decimal"
            step="0.0000001"
            value={formState.destLng}
            onChange={handleChange('destLng')}
            disabled={submitting}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="timezone">Timezone (optional)</Label>
          <Input
            id="timezone"
            type="text"
            value={formState.timezone}
            onChange={handleChange('timezone')}
            disabled={submitting}
            placeholder="e.g. America/Phoenix"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="drives-per-day">Drives per day (optional)</Label>
          <Input
            id="drives-per-day"
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            value={formState.drivesPerDay}
            onChange={handleChange('drivesPerDay')}
            disabled={submitting}
          />
        </div>
      </div>

      <div className="space-y-2">
        <span className="text-sm font-medium text-foreground">Activation</span>
        <label className="inline-flex items-center gap-3 text-sm font-medium text-muted-foreground">
          <input
            type="checkbox"
            checked={formState.isActive}
            onChange={handleCheckboxChange}
            disabled={submitting}
          />
          <span>{formState.isActive ? 'Active' : 'Inactive'}</span>
        </label>
      </div>

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
