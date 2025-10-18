'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';

function buildHref(identifier) {
  const safeIdentifier = encodeURIComponent(identifier);
  return `/dashboard/${safeIdentifier}`;
}

export default function BusinessSwitcher({ businesses, currentValue }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const hasMultipleOptions = Array.isArray(businesses) && businesses.length > 1;
  const effectiveCurrentValue = currentValue ?? '';

  function handleChange(event) {
    const nextValue = event.target.value;

    if (!nextValue || nextValue === effectiveCurrentValue) {
      return;
    }

    startTransition(() => {
      router.push(buildHref(nextValue));
    });
  }

  if (!Array.isArray(businesses) || businesses.length === 0) {
    return null;
  }

  return (
    <div className="business-switcher" data-pending={isPending ? 'true' : 'false'}>
      <label className="business-switcher__label" htmlFor="business-switcher-select">
        {hasMultipleOptions ? 'Switch business' : 'Business'}
      </label>
      <select
        className="business-switcher__select"
        id="business-switcher-select"
        value={effectiveCurrentValue}
        onChange={handleChange}
        disabled={isPending}
        aria-live="polite"
      >
        {businesses.map((business) => {
          const optionValue = business.value;
          const optionLabel = business.isActive
            ? business.label
            : `${business.label} (inactive)`;

          return (
            <option key={optionValue} value={optionValue}>
              {optionLabel}
            </option>
          );
        })}
      </select>
    </div>
  );
}
