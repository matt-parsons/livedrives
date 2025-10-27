'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday'
};

function toInputString(segments) {
  if (!Array.isArray(segments) || segments.length === 0) {
    return '';
  }

  return segments
    .map((segment) => (segment && typeof segment === 'string' ? segment.trim() : ''))
    .filter(Boolean)
    .join(', ');
}

function normalizeHoursInput(formState) {
  const hours = {};

  for (const day of DAY_ORDER) {
    const rawValue = formState[day] ?? '';
    const segments = String(rawValue)
      .split(/[;,\n]+/)
      .map((value) => value.trim())
      .filter(Boolean);

    hours[day] = segments;
  }

  return hours;
}

function mapResponseHours(hours) {
  return DAY_ORDER.reduce((acc, day) => {
    const segments = Array.isArray(hours?.[day]) ? hours[day] : [];
    acc[day] = toInputString(segments);
    return acc;
  }, {});
}

export default function BusinessHoursForm({ businessId, initialHours }) {
  const initialState = useMemo(() => {
    const source = initialHours && typeof initialHours === 'object' ? initialHours : {};
    return DAY_ORDER.reduce((acc, day) => {
      acc[day] = toInputString(source[day]);
      return acc;
    }, {});
  }, [initialHours]);

  const [formState, setFormState] = useState(initialState);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleChange = (day) => (event) => {
    const value = event.target.value;
    setFormState((prev) => ({ ...prev, [day]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccess('');

    const payload = { hours: normalizeHoursInput(formState) };

    try {
      const response = await fetch(`/api/businesses/${businessId}/business-hours`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save business hours.');
      }

      if (data.hours && typeof data.hours === 'object') {
        setFormState(mapResponseHours(data.hours));
      }

      setSuccess('Business hours saved.');
    } catch (err) {
      setError(err.message || 'Failed to save business hours.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="grid gap-6" onSubmit={handleSubmit}>
      <div className="grid gap-4 md:grid-cols-2">
        {DAY_ORDER.map((day) => (
          <div key={day} className="space-y-2">
            <Label htmlFor={`hours-${day}`}>{DAY_LABELS[day]}</Label>
            <Input
              id={`hours-${day}`}
              name={`hours-${day}`}
              value={formState[day] ?? ''}
              onChange={handleChange(day)}
              placeholder="09:00-17:00, 18:00-21:00"
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Separate windows with commas or semicolons. Leave blank if closed.
            </p>
          </div>
        ))}
      </div>

      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {success ? (
        <p className="text-sm text-emerald-600" role="status">
          {success}
        </p>
      ) : null}

      <div>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save business hours'}
        </Button>
      </div>
    </form>
  );
}
