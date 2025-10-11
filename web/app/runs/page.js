import { cookies, headers } from 'next/headers';
import { requireAuth } from '@/lib/authServer';

async function loadRuns() {
  const headerList = headers();
  const host = headerList.get('x-forwarded-host') ?? headerList.get('host');
  const protocol = headerList.get('x-forwarded-proto') ?? 'http';

  if (!host) {
    return { runs: [], error: 'Unable to determine request host.' };
  }

  const cookieHeader = cookies()
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');

  const response = await fetch(`${protocol}://${host}/api/runs`, {
    headers: cookieHeader ? { Cookie: cookieHeader } : {},
    cache: 'no-store',
  });

  if (!response.ok) {
    const details = await response.json().catch(() => ({}));
    return { runs: [], error: details.error ?? 'Failed to fetch runs.' };
  }

  const runs = await response.json();
  return { runs, error: null };
}

function formatDate(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

export default async function RunsPage() {
  await requireAuth();
  const { runs, error } = await loadRuns();

  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="mb-4 text-3xl font-semibold">Runs</h1>
      {error ? (
        <p className="rounded border border-red-200 bg-red-50 p-4 text-red-700">{error}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-sm font-semibold text-gray-600">Run ID</th>
                <th className="px-4 py-2 text-left text-sm font-semibold text-gray-600">Business ID</th>
                <th className="px-4 py-2 text-left text-sm font-semibold text-gray-600">Started</th>
                <th className="px-4 py-2 text-left text-sm font-semibold text-gray-600">Finished</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {runs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-sm text-gray-500">
                    No runs yet.
                  </td>
                </tr>
              ) : (
                runs.map((run) => (
                  <tr key={run.id}>
                    <td className="px-4 py-2 text-sm text-gray-700">{run.id}</td>
                    <td className="px-4 py-2 text-sm text-gray-700">{run.business_id}</td>
                    <td className="px-4 py-2 text-sm text-gray-700">{formatDate(run.started_at)}</td>
                    <td className="px-4 py-2 text-sm text-gray-700">{formatDate(run.finished_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
