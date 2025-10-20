'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';

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
  const [zonePendingDelete, setZonePendingDelete] = useState(null);

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
    } finally {
      setZonePendingDelete(null);
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
    <Card className="bg-card/90 shadow-md">
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-xl">Origin zones</CardTitle>
          <CardDescription>{caption}</CardDescription>
        </div>
        <Button type="button" variant="secondary" onClick={openCreateForm} disabled={submitting}>
          + Add origin zone
        </Button>
      </CardHeader>

      <CardContent className="space-y-6">
        {error ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        {zoneList.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/70 bg-muted/40 p-6 text-sm text-muted-foreground">
            <h3 className="text-lg font-semibold text-foreground">Origin strategy pending</h3>
            <p>Set up origin zones to activate balanced pickup coverage and routing logic.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {zoneList.map((zone) => (
              <div
                key={zone.id}
                className="flex h-full flex-col justify-between rounded-lg border border-border bg-background/80 p-5 shadow-sm"
              >
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1">
                    <h3 className="text-base font-semibold text-foreground">{zone.name || 'Unnamed zone'}</h3>
                    {zone.canonical ? <p className="text-sm text-muted-foreground">{zone.canonical}</p> : null}
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs font-medium text-muted-foreground">
                    {zone.zip ? <span className="rounded-full bg-accent/40 px-3 py-1">ZIP {zone.zip}</span> : null}
                    {zone.radiusLabel ? <span className="rounded-full bg-accent/40 px-3 py-1">{zone.radiusLabel}</span> : null}
                    {zone.weight !== null && zone.weight !== undefined ? (
                      <span className="rounded-full bg-accent/40 px-3 py-1">
                        Weight {formatDecimal(zone.weight, 2) ?? zone.weight}
                      </span>
                    ) : null}
                  </div>

                  <div className="grid gap-2 text-sm text-muted-foreground">
                    {zone.coordLabel ? <div>Coordinates: {zone.coordLabel}</div> : null}
                    {zone.keywords ? <div>Keywords: {zone.keywords}</div> : null}
                    {zone.createdLabel ? <div>Created: {zone.createdLabel}</div> : null}
                  </div>
                </div>

                <div className="mt-6 flex items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => openEditForm(zone)}
                    disabled={submitting}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive focus-visible:ring-destructive"
                    onClick={() => setZonePendingDelete(zone)}
                    disabled={submitting}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {(isCreating || isEditing) ? (
          <form className="grid gap-5 border-t border-border/60 pt-6" onSubmit={handleSubmit}>
            <h3 className="text-lg font-semibold text-foreground">{isEditing ? 'Edit origin zone' : 'Add origin zone'}</h3>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="zone-name">Zone name</Label>
                <Input
                  id="zone-name"
                  type="text"
                  value={formState.name}
                  onChange={handleChange('name')}
                  disabled={submitting}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="zone-canonical">Canonical label</Label>
                <Input
                  id="zone-canonical"
                  type="text"
                  value={formState.canonical}
                  onChange={handleChange('canonical')}
                  disabled={submitting}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="zone-zip">ZIP / postal code</Label>
                <Input
                  id="zone-zip"
                  type="text"
                  value={formState.zip}
                  onChange={handleChange('zip')}
                  disabled={submitting}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="zone-lat">Latitude</Label>
                <Input
                  id="zone-lat"
                  type="number"
                  inputMode="decimal"
                  step="0.000001"
                  value={formState.lat}
                  onChange={handleChange('lat')}
                  disabled={submitting}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="zone-lng">Longitude</Label>
                <Input
                  id="zone-lng"
                  type="number"
                  inputMode="decimal"
                  step="0.000001"
                  value={formState.lng}
                  onChange={handleChange('lng')}
                  disabled={submitting}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="zone-radius">Radius (miles)</Label>
                <Input
                  id="zone-radius"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.1"
                  value={formState.radiusMi}
                  onChange={handleChange('radiusMi')}
                  disabled={submitting}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="zone-weight">Weight</Label>
                <Input
                  id="zone-weight"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.1"
                  value={formState.weight}
                  onChange={handleChange('weight')}
                  disabled={submitting}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="zone-keywords">Keywords</Label>
                <Input
                  id="zone-keywords"
                  type="text"
                  value={formState.keywords}
                  onChange={handleChange('keywords')}
                  disabled={submitting}
                  placeholder="Comma or JSON list"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Saving...' : activeTitle}
              </Button>
              <Button type="button" variant="link" onClick={resetForm} disabled={submitting}>
                Cancel
              </Button>
            </div>
          </form>
        ) : null}
      </CardContent>

      <Dialog open={Boolean(zonePendingDelete)} onOpenChange={(open) => (!open ? setZonePendingDelete(null) : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete origin zone</DialogTitle>
            <DialogDescription>
              This action will remove "{zonePendingDelete?.name || 'Unnamed zone'}" and its routing data. The change cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-end">
            <Button type="button" variant="ghost" onClick={() => setZonePendingDelete(null)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => handleDelete(zonePendingDelete)}
              disabled={submitting || !zonePendingDelete}
            >
              {submitting ? 'Removing…' : 'Delete zone'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
