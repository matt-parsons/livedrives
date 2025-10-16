'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

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
    <form className="form-grid" onSubmit={handleSubmit}>
      <div className="input-field">
        <label className="input-label" htmlFor="places-query">Search Google Places</label>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'stretch' }}>
          <input
            id="places-query"
            className="text-input"
            type="text"
            value={placesQuery}
            onChange={handlePlacesQueryChange}
            disabled={submitting || placesLoading}
            placeholder="Search by business name or address"
            autoComplete="off"
          />
          <button
            type="button"
            className="secondary-button"
            onClick={handlePlaceSearch}
            disabled={submitting || placesLoading}
            style={{ width: 'auto', whiteSpace: 'nowrap' }}
          >
            {placesLoading ? 'Loading…' : 'Search'}
          </button>
        </div>
        <p className="input-help">Select a result to automatically fill in the business details.</p>
        {placesError ? <p className="error-text" role="alert">{placesError}</p> : null}
      </div>

      {placesResults.length > 0 ? (
        <div className="input-field">
          <span className="input-label">Search results</span>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '8px' }}>
            {placesResults.map((place) => (
              <li key={place.placeId} style={{ border: '1px solid #ccc', borderRadius: '8px', padding: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{place.name}</div>
                    {place.formattedAddress ? (
                      <div style={{ fontSize: '0.9rem', color: '#555' }}>{place.formattedAddress}</div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => handleSelectPlace(place.placeId)}
                    disabled={submitting || placesLoading}
                    style={{ width: 'auto', whiteSpace: 'nowrap' }}
                  >
                    Use this place
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="input-field">
        <label className="input-label" htmlFor="business-name">Business name</label>
        <input
          id="business-name"
          className="text-input"
          type="text"
          value={formState.businessName}
          onChange={handleChange('businessName')}
          required
          disabled={submitting}
          autoComplete="organization"
        />
      </div>

      <div className="input-field">
        <label className="input-label" htmlFor="business-slug">Slug (optional)</label>
        <input
          id="business-slug"
          className="text-input"
          type="text"
          value={formState.businessSlug}
          onChange={handleChange('businessSlug')}
          disabled={submitting}
          placeholder="auto-generated from business name"
        />
      </div>

      <div className="input-field">
        <label className="input-label" htmlFor="brand-search">Brand search label (optional)</label>
        <input
          id="brand-search"
          className="text-input"
          type="text"
          value={formState.brandSearch}
          onChange={handleChange('brandSearch')}
          disabled={submitting}
          placeholder="Used for search matching"
        />
      </div>

      <div className="input-field">
        <label className="input-label" htmlFor="mid">Google MID (optional)</label>
        <input
          id="mid"
          className="text-input"
          type="text"
          value={formState.mid}
          onChange={handleChange('mid')}
          disabled={submitting}
        />
      </div>

      <div className="input-field">
        <label className="input-label" htmlFor="gplace">Google Place ID (optional)</label>
        <input
          id="gplace"
          className="text-input"
          type="text"
          value={formState.gPlaceId}
          onChange={handleChange('gPlaceId')}
          disabled={submitting}
        />
      </div>

      <div className="input-field">
        <label className="input-label" htmlFor="destination-address">Destination address (optional)</label>
        <input
          id="destination-address"
          className="text-input"
          type="text"
          value={formState.destinationAddress}
          onChange={handleChange('destinationAddress')}
          disabled={submitting}
        />
      </div>

      <div className="input-field">
        <label className="input-label" htmlFor="destination-zip">Destination ZIP (optional)</label>
        <input
          id="destination-zip"
          className="text-input"
          type="text"
          value={formState.destinationZip}
          onChange={handleChange('destinationZip')}
          disabled={submitting}
        />
      </div>

      <div className="input-field">
        <label className="input-label" htmlFor="dest-lat">Destination latitude (optional)</label>
        <input
          id="dest-lat"
          className="text-input"
          type="number"
          inputMode="decimal"
          step="0.0000001"
          value={formState.destLat}
          onChange={handleChange('destLat')}
          disabled={submitting}
        />
      </div>

      <div className="input-field">
        <label className="input-label" htmlFor="dest-lng">Destination longitude (optional)</label>
        <input
          id="dest-lng"
          className="text-input"
          type="number"
          inputMode="decimal"
          step="0.0000001"
          value={formState.destLng}
          onChange={handleChange('destLng')}
          disabled={submitting}
        />
      </div>

      <div className="input-field">
        <label className="input-label" htmlFor="timezone">Timezone (optional)</label>
        <input
          id="timezone"
          className="text-input"
          type="text"
          value={formState.timezone}
          onChange={handleChange('timezone')}
          disabled={submitting}
          placeholder="e.g. America/Phoenix"
        />
      </div>

      <div className="input-field">
        <label className="input-label" htmlFor="drives-per-day">Drives per day (optional)</label>
        <input
          id="drives-per-day"
          className="text-input"
          type="number"
          inputMode="numeric"
          min="0"
          step="1"
          value={formState.drivesPerDay}
          onChange={handleChange('drivesPerDay')}
          disabled={submitting}
        />
      </div>

      <div className="input-field">
        <span className="input-label">Activation</span>
        <label style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <input
            type="checkbox"
            checked={formState.isActive}
            onChange={handleCheckboxChange}
            disabled={submitting}
          />
          <span>{formState.isActive ? 'Active' : 'Inactive'}</span>
        </label>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      <button className="primary-button" type="submit" disabled={submitting}>
        {submitting ? 'Saving...' : title}
      </button>
    </form>
  );
}
