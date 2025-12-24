'use client';

import { useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const DASHBOARD_SEGMENTS = new Set([
  'optimization-steps',
  'keywords',
  'reviews',
  'settings',
  'runs',
  'ctr',
  'get-started',
  'operations',
  'upgrade',
  'businesses',
  'geo-grid-launcher'
]);

function resolveDashboardPathname(pathname) {
  if (!pathname) {
    return '/dashboard';
  }

  const segments = pathname.split('/').filter(Boolean);

  if (segments.length === 0 || segments[0] !== 'dashboard') {
    return '/dashboard';
  }

  if (segments.length === 1) {
    return '/dashboard';
  }

  const secondSegment = segments[1];

  if (DASHBOARD_SEGMENTS.has(secondSegment)) {
    return `/${segments.join('/')}`;
  }

  const remaining = segments.slice(2);

  return remaining.length ? `/dashboard/${remaining.join('/')}` : '/dashboard';
}

export default function BusinessSwitcher({ businesses, currentValue }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const hasMultipleOptions = Array.isArray(businesses) && businesses.length > 1;
  const effectiveCurrentValue = currentValue ? String(currentValue) : '';

  function handleChange(nextValue) {
    const value = nextValue;

    if (!value || value === effectiveCurrentValue) {
      return;
    }

    startTransition(() => {
      const nextPath = resolveDashboardPathname(pathname);
      const params = new URLSearchParams(searchParams?.toString());
      params.set('bId', value);
      const nextHref = params.toString() ? `${nextPath}?${params.toString()}` : nextPath;
      router.push(nextHref);
    });
  }

  if (!Array.isArray(businesses) || businesses.length === 0) {
    return null;
  }

  return (
    <div className="business-switcher" data-pending={isPending ? 'true' : 'false'}>
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
