'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function DashboardError({ error, reset }) {
  const router = useRouter();

  useEffect(() => {
    if (!error) return;
    const message = error?.message ?? '';
    if (message.toLowerCase().includes('unauthorized') || message.toLowerCase().includes('forbidden')) {
      router.replace('/signin');
    }
  }, [error, router]);

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h2 className="text-2xl font-semibold">Something went wrong</h2>
      <p className="text-gray-600">Please try again or return to the sign-in page.</p>
      <button
        type="button"
        onClick={reset}
        className="rounded bg-blue-600 px-4 py-2 font-semibold text-white"
      >
        Try again
      </button>
    </div>
  );
}
