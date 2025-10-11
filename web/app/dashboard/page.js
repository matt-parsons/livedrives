import { requireAuth } from '@/lib/authServer';

export default async function DashboardPage() {
  const session = await requireAuth();

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-4 text-3xl font-semibold">Dashboard</h1>
      <section className="rounded border border-gray-200 bg-white p-4 shadow-sm">
        <p className="text-gray-700">
          You are signed in as <strong>{session.email ?? session.firebaseUid}</strong>.
        </p>
        <ul className="mt-4 space-y-2 text-gray-700">
          <li>
            <span className="font-medium">User ID:</span> {session.userId}
          </li>
          <li>
            <span className="font-medium">Organization ID:</span> {session.organizationId}
          </li>
          <li>
            <span className="font-medium">Role:</span> {session.role}
          </li>
        </ul>
      </section>
    </main>
  );
}
