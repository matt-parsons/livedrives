'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Divider,
  Input,
  Textarea
} from '@heroui/react';

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
      createdLabel: zone.createdAt ? new Date(zone.createdAt).toLocaleString() : null
    };
  });

  return (
    <Card className="border border-content3/40 bg-content1/90 shadow-large">
      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">Origin zones</h2>
          <p className="text-sm text-foreground/60">{caption}</p>
        </div>
        <Button color="secondary" variant="flat" onPress={openCreateForm} isDisabled={submitting}>
          + Add origin zone
        </Button>
      </CardHeader>
      <Divider />
      <CardBody className="space-y-6">
        {error ? (
          <Card radius="md" className="border border-danger/40 bg-danger-50/40">
            <CardBody className="space-y-1 text-sm text-danger-700">
              <p className="font-semibold">We couldn’t complete that request</p>
              <p>{error}</p>
            </CardBody>
          </Card>
        ) : null}

        {zoneList.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-content3/60 bg-content2/60 px-6 py-10 text-center">
            <h3 className="text-lg font-semibold text-foreground">Origin strategy pending</h3>
            <p className="max-w-md text-sm text-foreground/70">
              Set up origin zones to activate balanced pickup coverage and routing logic.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {zoneList.map((zone) => (
              <Card key={zone.id} radius="lg" variant="bordered" className="border-content3/40 bg-content1/80">
                <CardHeader className="flex items-start justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <h3 className="text-lg font-semibold text-foreground">{zone.name || 'Unnamed zone'}</h3>
                    {zone.canonical ? (
                      <p className="text-sm text-foreground/60">{zone.canonical}</p>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="flat"
                      onPress={() => openEditForm(zone)}
                      isDisabled={submitting}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="light"
                      color="danger"
                      onPress={() => handleDelete(zone)}
                      isDisabled={submitting}
                    >
                      Remove
                    </Button>
                  </div>
                </CardHeader>
                <Divider />
                <CardBody className="space-y-3 text-sm text-foreground/70">
                  <div className="flex flex-wrap gap-2">
                    {zone.zip ? (
                      <Chip size="sm" variant="flat" color="secondary">
                        ZIP {zone.zip}
                      </Chip>
                    ) : null}
                    {zone.radiusLabel ? (
                      <Chip size="sm" variant="flat" color="secondary">
                        {zone.radiusLabel}
                      </Chip>
                    ) : null}
                    {zone.weight !== null && zone.weight !== undefined ? (
                      <Chip size="sm" variant="flat" color="secondary">
                        Weight {formatDecimal(zone.weight, 2) ?? zone.weight}
                      </Chip>
                    ) : null}
                  </div>
                  {zone.coordLabel ? (
                    <p className="text-sm text-foreground/70">Coordinates: {zone.coordLabel}</p>
                  ) : null}
                  {zone.keywords ? (
                    <p className="text-sm text-foreground/70">Keywords: {zone.keywords}</p>
                  ) : null}
                  {zone.createdLabel ? (
                    <p className="text-xs text-foreground/50">Created {zone.createdLabel}</p>
                  ) : null}
                </CardBody>
              </Card>
            ))}
          </div>
        )}

        {(isCreating || isEditing) ? (
          <form
            onSubmit={handleSubmit}
            className="grid gap-4 rounded-2xl border border-content3/40 bg-content2/70 p-6"
          >
            <div className="flex flex-col gap-1">
              <h3 className="text-lg font-semibold text-foreground">
                {isEditing ? `Edit ${activeZone?.name || 'origin zone'}` : 'Add origin zone'}
              </h3>
              <p className="text-sm text-foreground/60">
                Define coordinates and weighting to balance dispatching coverage.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Input
                label="Zone name"
                value={formState.name}
                onChange={handleChange('name')}
                disabled={submitting}
              />
              <Input
                label="Canonical label"
                value={formState.canonical}
                onChange={handleChange('canonical')}
                disabled={submitting}
              />
              <Input
                label="ZIP / postal code"
                value={formState.zip}
                onChange={handleChange('zip')}
                disabled={submitting}
              />
              <Input
                label="Latitude"
                type="number"
                inputMode="decimal"
                step="0.000001"
                value={formState.lat}
                onChange={handleChange('lat')}
                disabled={submitting}
                required
              />
              <Input
                label="Longitude"
                type="number"
                inputMode="decimal"
                step="0.000001"
                value={formState.lng}
                onChange={handleChange('lng')}
                disabled={submitting}
                required
              />
              <Input
                label="Radius (miles)"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.1"
                value={formState.radiusMi}
                onChange={handleChange('radiusMi')}
                disabled={submitting}
              />
              <Input
                label="Weight"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.1"
                value={formState.weight}
                onChange={handleChange('weight')}
                disabled={submitting}
              />
            </div>

            <Textarea
              label="Keywords"
              placeholder="Comma or JSON list"
              value={formState.keywords}
              onChange={handleChange('keywords')}
              disabled={submitting}
            />

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" color="primary" isLoading={submitting}>
                {activeTitle}
              </Button>
              <Button variant="light" onPress={resetForm} disabled={submitting}>
                Cancel
              </Button>
            </div>
          </form>
        ) : null}
      </CardBody>
    </Card>
  );
}
