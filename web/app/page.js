import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-4 p-6">
      <h1 className="text-3xl font-semibold">Welcome to LiveDrives</h1>
      <p className="text-gray-600">
        Access your dashboard, manage businesses, and review recent runs once you are signed in.
      </p>
      <div className="flex gap-3">
        <Link
          href="/signin"
          className="rounded bg-blue-600 px-4 py-2 font-semibold text-white"
        >
          Sign in
        </Link>
        <Link
          href="/dashboard"
          className="rounded border border-blue-600 px-4 py-2 font-semibold text-blue-600"
        >
          Go to dashboard
        </Link>
      </div>
    </main>
  );
}
