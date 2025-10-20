'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

function buildHref(identifier) {
  const safeIdentifier = encodeURIComponent(identifier);
  return `/dashboard/${safeIdentifier}`;
}

export default function BusinessSwitcher({ businesses, currentValue }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const hasMultipleOptions = Array.isArray(businesses) && businesses.length > 1;
  const effectiveCurrentValue = currentValue ?? '';

  function handleChange(nextValue) {
    const value = nextValue;

    if (!value || value === effectiveCurrentValue) {
      return;
    }

    startTransition(() => {
      router.push(buildHref(value));
    });
  }

  if (!Array.isArray(businesses) || businesses.length === 0) {
    return null;
  }

  return (
    <div className="business-switcher" data-pending={isPending ? 'true' : 'false'}>
      <Label className="business-switcher__label" htmlFor="business-switcher-select">
        {hasMultipleOptions ? 'Switch business' : 'Business'}
      </Label>
      <Select value={effectiveCurrentValue} onValueChange={handleChange} disabled={isPending}>
        <SelectTrigger id="business-switcher-select" aria-live="polite" className="business-switcher__select">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {businesses.map((business) => {
            const optionValue = business.value;
            const optionLabel = business.isActive
              ? business.label
              : `${business.label} (inactive)`;

            return (
              <SelectItem key={optionValue} value={optionValue}>
                {optionLabel}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}
