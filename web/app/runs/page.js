import { headers, cookies } from 'next/headers';
import { redirect } from 'next/navigation';

function buildCookieHeader() {
  const cookieStore = cookies();
  const all = cookieStore.getAll();

  if (!all.length) {
    return undefined;
  }

  return all.map(({ name, value }) => `${name}=${value}`).join('; ');
}

async function loadRuns() {
  const headerStore = headers();
  const host = headerStore.get('x-forwarded-host') ?? headerStore.get('host');
  const protocol = headerStore.get('x-forwarded-proto') ?? (process.env.NODE_ENV === 'production' ? 'https' : 'http');

  if (!host) {
    throw new Error('Unable to resolve request host');
  }

  const cookieHeader = buildCookieHeader();
  const response = await fetch(`${protocol}://${host}/api/runs`, {
    headers: cookieHeader ? { cookie: cookieHeader } : {},
    cache: 'no-store'
  });

  if (response.status === 401 || response.status === 403) {
    redirect('/signin');
  }

  if (!response.ok) {
    throw new Error('Failed to load runs');
  }

  return response.json();
}

export default async function RunsPage() {
  const data = await loadRuns();
  const runs = data.runs ?? [];

  return (
    <main>
      <h1>Runs</h1>
      {runs.length === 0 ? (
        <p>No runs yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Business</th>
              <th>Status</th>
              <th>Started</th>
              <th>Completed</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id}>
                <td>{run.id}</td>
                <td>{run.businessName ?? run.businessId}</td>
                <td>{run.status ?? 'unknown'}</td>
                <td>{run.startedAt ?? '—'}</td>
                <td>{run.completedAt ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
