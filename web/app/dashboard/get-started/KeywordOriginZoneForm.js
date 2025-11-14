'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
  existingZone,
  manageHref
}) {
  const router = useRouter();
  const [keyword, setKeyword] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (existingZone) {
    const coordLabel = existingZone.lat !== null && existingZone.lng !== null
      ? `${formatCoordinate(existingZone.lat)}, ${formatCoordinate(existingZone.lng)}`
      : null;

    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-lg border border-border/70 bg-muted/40 p-4 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Origin zone created</p>
          <p className="mt-1">
            You're all set. The keyword <strong>{existingZone.keywords || '—'}</strong> is tied to
            "{existingZone.name || 'Primary coverage'}" with a {existingZone.radiusMi ?? 0} mile radius.
          </p>
          {coordLabel ? (
            <p className="mt-1">Coordinates: {coordLabel}</p>
          ) : null}
        </div>
        {manageHref ? (
          <Button asChild variant="secondary" size="sm">
            <Link href={manageHref}>Manage origin zones</Link>
          </Button>
        ) : null}
      </div>
    );
  }

  const hasCoordinates = Number.isFinite(Number(destLat)) && Number.isFinite(Number(destLng));

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setStatus('');

    const trimmed = keyword.trim();

    if (!trimmed) {
      setError('Enter a keyword to create your origin zone.');
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
          name: 'Primary coverage zone',
          canonical: destinationAddress || businessName || 'Primary coverage zone',
          zip: destinationZip || null,
          lat: Number(destLat),
          lng: Number(destLng),
          radiusMi: 3,
          weight: 1,
          keywords: trimmed
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

  return (
    <form className="grid gap-4" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <Label htmlFor="onboarding-keyword">Keyword</Label>
        <Input
          id="onboarding-keyword"
          type="text"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="e.g. house painter near me"
          disabled={submitting}
        />
        <p className="text-xs text-muted-foreground">
          We'll use this keyword to seed your first origin zone with a 3 mile radius around the business.
        </p>
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

      <Button type="submit" disabled={submitting}>
        {submitting ? 'Creating zone…' : 'Create origin zone'}
      </Button>
    </form>
  );
}
