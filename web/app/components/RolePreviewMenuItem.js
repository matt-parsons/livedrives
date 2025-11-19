'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';

export default function RolePreviewMenuItem({ isPreviewing }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const togglePreview = () => {
    startTransition(async () => {
      const response = await fetch('/api/role-preview', {
        method: isPreviewing ? 'DELETE' : 'POST',
        headers: isPreviewing ? undefined : { 'Content-Type': 'application/json' },
        body: isPreviewing ? undefined : JSON.stringify({ role: 'member' })
      });

      if (!response.ok) {
        console.error('Failed to toggle role preview');
        return;
      }

      router.refresh();
    });
  };

  return (
    <DropdownMenuItem
      onSelect={(event) => {
        event.preventDefault();
        togglePreview();
      }}
      disabled={isPending}
      className="flex flex-col items-start gap-1"
    >
      <span className="font-semibold leading-tight">
        {isPreviewing ? 'Exit member preview' : 'Preview as member'}
      </span>
      <span className="text-xs text-muted-foreground">
        {isPreviewing
          ? 'Return to your admin workspace view.'
          : 'Temporarily view the dashboard as a member user.'}
      </span>
    </DropdownMenuItem>
  );
}
