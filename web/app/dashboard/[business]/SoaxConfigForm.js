'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function normalizeString(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
}

export default function SoaxConfigForm({ businessId, initialConfig }) {
  const [formState, setFormState] = useState(() => ({
    endpoint: normalizeString(initialConfig?.endpoint),
    username: normalizeString(initialConfig?.username),
    resUsername: normalizeString(initialConfig?.resUsername)
  }));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleChange = (field) => (event) => {
    const value = event.target.value;
    setFormState((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccess('');

    const payload = {
      endpoint: normalizeString(formState.endpoint),
      username: normalizeString(formState.username),
      resUsername: normalizeString(formState.resUsername)
    };

    try {
      const response = await fetch(`/api/businesses/${businessId}/soax-config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save SOAX configuration.');
      }

      if (data.config && typeof data.config === 'object') {
        setFormState({
          endpoint: normalizeString(data.config.endpoint),
          username: normalizeString(data.config.username),
          resUsername: normalizeString(data.config.resUsername)
        });
      } else {
        setFormState(payload);
      }

      setSuccess('SOAX configuration saved.');
    } catch (err) {
      setError(err.message || 'Failed to save SOAX configuration.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="grid gap-6" onSubmit={handleSubmit}>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="soax-endpoint">Proxy endpoint</Label>
          <Input
            id="soax-endpoint"
            name="endpoint"
            value={formState.endpoint}
            onChange={handleChange('endpoint')}
            placeholder="proxy.soax.com:5000"
            autoComplete="off"
            required
          />
          <p className="text-xs text-muted-foreground">
            Format: host:port for the SOAX proxy endpoint assigned to this business.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="soax-username">Username</Label>
          <Input
            id="soax-username"
            name="username"
            value={formState.username}
            onChange={handleChange('username')}
            autoComplete="off"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="soax-res-username">Residential username</Label>
          <Input
            id="soax-res-username"
            name="resUsername"
            value={formState.resUsername}
            onChange={handleChange('resUsername')}
            autoComplete="off"
          />
        </div>
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
          {submitting ? 'Saving…' : 'Save SOAX configuration'}
        </Button>
      </div>
    </form>
  );
}
