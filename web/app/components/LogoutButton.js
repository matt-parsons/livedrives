'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function LogoutButton({ className, variant = 'secondary', size = 'sm', children = 'Log out' }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const handleLogout = () => {
    if (pending) return;

    startTransition(async () => {
      try {
        const response = await fetch('/api/auth/logout', {
          method: 'POST',
          credentials: 'include'
        });

        if (!response.ok) {
          throw new Error('Failed to log out');
        }
      } catch (error) {
        console.error('Logout failed', error);
        return;
      }

      router.push('/');
      router.refresh();
    });
  };

  return (
    <button
      type="button"
      className={cn(buttonVariants({ variant, size }), className)}
      onClick={handleLogout}
      disabled={pending}
    >
      {pending ? 'Signing out…' : children}
    </button>
  );
}
