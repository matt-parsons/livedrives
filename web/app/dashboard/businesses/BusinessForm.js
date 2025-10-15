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

  const title = useMemo(() => (mode === 'edit' ? 'Save changes' : 'Create business'), [mode]);

  const handleChange = (field) => (event) => {
    const value = event.target.value;
    setFormState((prev) => ({ ...prev, [field]: value }));
  };

  const handleCheckboxChange = (event) => {
    const { checked } = event.target;
    setFormState((prev) => ({ ...prev, isActive: checked }));
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
