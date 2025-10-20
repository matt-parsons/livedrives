'use client';

import { useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Select, SelectItem } from '@heroui/react';

function buildHref(identifier) {
  const safeIdentifier = encodeURIComponent(identifier);
  return `/dashboard/${safeIdentifier}`;
}

export default function BusinessSwitcher({ businesses, currentValue }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const hasMultipleOptions = Array.isArray(businesses) && businesses.length > 1;
  const effectiveCurrentValue = currentValue ?? '';
  const selectedKeys = useMemo(() => (effectiveCurrentValue ? new Set([effectiveCurrentValue]) : new Set()), [
    effectiveCurrentValue
  ]);

  function handleSelectionChange(keys) {
    const [nextValue] = Array.from(keys ?? []);

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
    <Select
      aria-label="Select business"
      label={hasMultipleOptions ? 'Switch business' : 'Business'}
      placeholder={hasMultipleOptions ? 'Choose a business' : undefined}
      selectedKeys={selectedKeys}
      onSelectionChange={handleSelectionChange}
      isDisabled={isPending || !hasMultipleOptions}
      variant="bordered"
      disallowEmptySelection
      classNames={{
        trigger: 'bg-content1/80 border-white/10 backdrop-blur-md',
        label: 'text-xs font-semibold uppercase tracking-wide text-foreground/60'
      }}
    >
      {businesses.map((business) => (
        <SelectItem
          key={business.value}
          value={business.value}
          description={business.isActive ? undefined : 'Inactive business'}
          className={!business.isActive ? 'text-foreground/50' : undefined}
        >
          {business.label}
        </SelectItem>
      ))}
    </Select>
  );
}
