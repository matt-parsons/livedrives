'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

function toInputString(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value);
}

function formatDecimal(value, digits = 1) {
  if (value === null || value === undefined) {
    return null;
  }

  const number = Number(value);
  if (!Number.isFinite(number)) {
    return null;
  }

  return number.toFixed(digits);
}

function formatCoordinate(value, digits = 5) {
  if (value === null || value === undefined) {
    return null;
  }

  const number = Number(value);
  if (!Number.isFinite(number)) {
    return null;
  }

  return number.toFixed(digits);
}

function formatCoordinatePair(lat, lng, digits = 5) {
  const latStr = formatCoordinate(lat, digits);
  const lngStr = formatCoordinate(lng, digits);

  if (!latStr || !lngStr) {
    return null;
  }

  return `${latStr}, ${lngStr}`;
}

const EMPTY_FORM = {
  name: '',
  canonical: '',
  zip: '',
  lat: '',
  lng: '',
  radiusMi: '',
  weight: '',
  keywords: ''
};

function toFormState(zone = null) {
  if (!zone) {
    return { ...EMPTY_FORM };
  }

  return {
    name: zone.name ?? '',
    canonical: zone.canonical ?? '',
    zip: zone.zip ?? '',
    lat: toInputString(zone.lat),
    lng: toInputString(zone.lng),
    radiusMi: toInputString(zone.radiusMi),
    weight: toInputString(zone.weight),
    keywords: zone.keywords ?? ''
  };
}

function orderZones(zones) {
  return zones.slice().sort((a, b) => {
    const aName = (a.name || '').toLowerCase();
    const bName = (b.name || '').toLowerCase();

    if (aName && bName) {
      if (aName < bName) return -1;
      if (aName > bName) return 1;
    }

    return Number(a.id) - Number(b.id);
  });
}

export default function OriginZonesManager({ businessId, initialZones = [], caption }) {
  const router = useRouter();
  const [zones, setZones] = useState(() => orderZones(initialZones));
  const [formMode, setFormMode] = useState(null);
  const [editingZoneId, setEditingZoneId] = useState(null);
  const [formState, setFormState] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const isEditing = formMode === 'edit';
  const isCreating = formMode === 'create';
  const activeTitle = isEditing ? 'Save changes' : 'Create zone';

  const activeZone = useMemo(() => {
    if (!isEditing) {
      return null;
    }

    return zones.find((zone) => zone.id === editingZoneId) ?? null;
  }, [isEditing, zones, editingZoneId]);

  const handleChange = (field) => (event) => {
    const value = event.target.value;
    setFormState((prev) => ({ ...prev, [field]: value }));
  };

  const resetForm = () => {
    setFormMode(null);
    setEditingZoneId(null);
    setFormState(EMPTY_FORM);
    setSubmitting(false);
    setError('');
  };

  const openCreateForm = () => {
    setFormMode('create');
    setEditingZoneId(null);
    setFormState({ ...EMPTY_FORM });
    setError('');
  };

  const openEditForm = (zone) => {
    setFormMode('edit');
    setEditingZoneId(zone.id);
    setFormState(toFormState(zone));
    setError('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!formMode) return;

    setSubmitting(true);
    setError('');

    const payload = {
      name: formState.name.trim() || null,
      canonical: formState.canonical.trim() || null,
      zip: formState.zip.trim() || null,
      lat: formState.lat.trim(),
      lng: formState.lng.trim(),
      radiusMi: formState.radiusMi.trim(),
      weight: formState.weight.trim(),
      keywords: formState.keywords.trim() || null
    };

    if (payload.lat === '') payload.lat = null;
    if (payload.lng === '') payload.lng = null;
    if (payload.radiusMi === '') payload.radiusMi = null;
    if (payload.weight === '') payload.weight = null;

    const endpoint = isEditing
      ? `/api/businesses/${businessId}/origin-zones/${editingZoneId}`
      : `/api/businesses/${businessId}/origin-zones`;
    const method = isEditing ? 'PATCH' : 'POST';

    try {
      const response = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save origin zone.');
      }

      if (!data.zone) {
        throw new Error('API response missing zone payload.');
      }

      setZones((prev) => {
        const next = isEditing
          ? prev.map((zone) => (zone.id === data.zone.id ? data.zone : zone))
          : [...prev, data.zone];
        return orderZones(next);
      });

      resetForm();
      router.refresh();
    } catch (err) {
      setError(err.message || 'Failed to save origin zone.');
      setSubmitting(false);
    }
  };

  const handleDelete = async (zone) => {
    if (!zone || submitting) {
      return;
    }

    const confirmed = window.confirm(`Delete origin zone "${zone.name || 'Unnamed zone'}"?`);
    if (!confirmed) {
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const response = await fetch(`/api/businesses/${businessId}/origin-zones/${zone.id}`, {
        method: 'DELETE'
      });

      if (!response.ok && response.status !== 204) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to delete origin zone.');
      }

      setZones((prev) => prev.filter((item) => item.id !== zone.id));

      if (isEditing && zone.id === editingZoneId) {
        resetForm();
      } else {
        setSubmitting(false);
      }

      router.refresh();
    } catch (err) {
      setError(err.message || 'Failed to delete origin zone.');
      setSubmitting(false);
    }
  };

  const zoneList = zones.map((zone) => {
    const radiusLabel = zone.radiusMi !== null && zone.radiusMi !== undefined
      ? `${formatDecimal(zone.radiusMi, 1) ?? zone.radiusMi} mi radius`
      : null;
    const coordLabel = formatCoordinatePair(zone.lat, zone.lng);

    return {
      ...zone,
      radiusLabel,
      coordLabel,
      createdLabel: zone.createdAt ? new Date(zone.createdAt).toISOString() : null
    };
  });

  return (
    <div className="surface-card surface-card--muted">
      <div className="section-header">
        <div>
          <h2 className="section-title">Origin zones</h2>
          <p className="section-caption">{caption}</p>
        </div>
        <button type="button" className="cta-link" onClick={openCreateForm}>
          + Add origin zone
        </button>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      {zoneList.length === 0 ? (
        <div className="empty-state">
          <div>
            <h3>Origin strategy pending</h3>
            <p>Set up origin zones to activate balanced pickup coverage and routing logic.</p>
          </div>
        </div>
      ) : (
        <ul className="card-list card-list--grid zone-grid">
          {zoneList.map((zone) => (
            <li key={zone.id}>
              <div className="list-card zone-card">
                <div className="list-card-header">
                  <div>
                    <h3 className="list-card-title">{zone.name || 'Unnamed zone'}</h3>
                    {zone.canonical ? <p className="list-card-subtitle">{zone.canonical}</p> : null}
                  </div>
                  <div className="zone-actions">
                    <button
                      type="button"
                      className="inline-button"
                      onClick={() => openEditForm(zone)}
                      disabled={submitting}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="inline-button inline-button--danger"
                      onClick={() => handleDelete(zone)}
                      disabled={submitting}
                    >
                      Remove
                    </button>
                  </div>
                </div>

                <div className="zone-card__meta">
                  {zone.zip ? <span>ZIP {zone.zip}</span> : null}
                  {zone.radiusLabel ? <span>{zone.radiusLabel}</span> : null}
                  {zone.weight !== null && zone.weight !== undefined ? (
                    <span>Weight {formatDecimal(zone.weight, 2) ?? zone.weight}</span>
                  ) : null}
                </div>

                <div className="zone-card__grid">
                  {zone.coordLabel ? <div>Coordinates: {zone.coordLabel}</div> : null}
                  {zone.keywords ? <div>Keywords: {zone.keywords}</div> : null}
                  {zone.createdLabel ? <div>Created: {zone.createdLabel}</div> : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {(isCreating || isEditing) ? (
        <form className="form-grid zone-form" onSubmit={handleSubmit}>
          <h3>{isEditing ? 'Edit origin zone' : 'Add origin zone'}</h3>

          <div className="input-field">
            <label className="input-label" htmlFor="zone-name">Zone name</label>
            <input
              id="zone-name"
              className="text-input"
              type="text"
              value={formState.name}
              onChange={handleChange('name')}
              disabled={submitting}
            />
          </div>

          <div className="input-field">
            <label className="input-label" htmlFor="zone-canonical">Canonical label</label>
            <input
              id="zone-canonical"
              className="text-input"
              type="text"
              value={formState.canonical}
              onChange={handleChange('canonical')}
              disabled={submitting}
            />
          </div>

          <div className="input-field">
            <label className="input-label" htmlFor="zone-zip">ZIP / postal code</label>
            <input
              id="zone-zip"
              className="text-input"
              type="text"
              value={formState.zip}
              onChange={handleChange('zip')}
              disabled={submitting}
            />
          </div>

          <div className="input-field">
            <label className="input-label" htmlFor="zone-lat">Latitude</label>
            <input
              id="zone-lat"
              className="text-input"
              type="number"
              inputMode="decimal"
              step="0.000001"
              value={formState.lat}
              onChange={handleChange('lat')}
              disabled={submitting}
              required
            />
          </div>

          <div className="input-field">
            <label className="input-label" htmlFor="zone-lng">Longitude</label>
            <input
              id="zone-lng"
              className="text-input"
              type="number"
              inputMode="decimal"
              step="0.000001"
              value={formState.lng}
              onChange={handleChange('lng')}
              disabled={submitting}
              required
            />
          </div>

          <div className="input-field">
            <label className="input-label" htmlFor="zone-radius">Radius (miles)</label>
            <input
              id="zone-radius"
              className="text-input"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.1"
              value={formState.radiusMi}
              onChange={handleChange('radiusMi')}
              disabled={submitting}
            />
          </div>

          <div className="input-field">
            <label className="input-label" htmlFor="zone-weight">Weight</label>
            <input
              id="zone-weight"
              className="text-input"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.1"
              value={formState.weight}
              onChange={handleChange('weight')}
              disabled={submitting}
            />
          </div>

          <div className="input-field">
            <label className="input-label" htmlFor="zone-keywords">Keywords</label>
            <input
              id="zone-keywords"
              className="text-input"
              type="text"
              value={formState.keywords}
              onChange={handleChange('keywords')}
              disabled={submitting}
              placeholder="Comma or JSON list"
            />
          </div>

          <div className="zone-form__actions">
            <button className="primary-button" type="submit" disabled={submitting}>
              {submitting ? 'Saving...' : activeTitle}
            </button>
            <button
              type="button"
              className="inline-button"
              onClick={resetForm}
              disabled={submitting}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
