import { headers, cookies } from 'next/headers';
import { redirect } from 'next/navigation';

function normalizeStatus(status) {
  if (!status) {
    return { key: 'unknown', label: 'Unknown' };
  }

  const value = status.toString();
  const lower = value.toLowerCase();

  if (lower.includes('complete')) {
    return { key: 'completed', label: 'Completed' };
  }

  if (lower.includes('progress') || lower.includes('running')) {
    return { key: 'in_progress', label: 'In progress' };
  }

  return { key: 'unknown', label: value.replace(/_/g, ' ') };
}

function formatDateTime(value) {
  if (!value) {
    return '—';
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

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
  const inProgressCount = runs.filter((run) => {
    const { key } = normalizeStatus(run.status);
    return key === 'in_progress';
  }).length;
  const completedCount = runs.filter((run) => {
    const { key } = normalizeStatus(run.status);
    return key === 'completed';
  }).length;

  return (
    <div className="page-shell">
      <section className="page-header">
        <h1 className="page-title">Runs intelligence</h1>
        <p className="page-subtitle">
          Monitor the lifecycle of every Livedrives run with real-time progress indicators and a polished
          operational view.
        </p>
      </section>

      <section className="section">
        <div className="surface-card surface-card--muted surface-card--compact">
          <div className="account-details">
            <div className="detail-tile">
              <strong>Total runs</strong>
              <span>{runs.length}</span>
            </div>
            <div className="detail-tile">
              <strong>In progress</strong>
              <span>{inProgressCount}</span>
            </div>
            <div className="detail-tile">
              <strong>Completed</strong>
              <span>{completedCount}</span>
            </div>
          </div>
        </div>

        {runs.length === 0 ? (
          <div className="empty-state">
            <div>
              <h3>No runs yet</h3>
              <p>Scheduled runs will surface here the moment your teams deploy them.</p>
            </div>
          </div>
        ) : (
          <div className="data-table-wrapper">
            <table className="data-table">
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
                {runs.map((run) => {
                  const status = normalizeStatus(run.status);

                  return (
                    <tr key={run.id}>
                      <td>{run.id}</td>
                      <td>{run.businessName ?? run.businessId}</td>
                      <td>
                        <span className="status-pill" data-status={status.key}>
                          {status.label}
                        </span>
                      </td>
                      <td>{formatDateTime(run.startedAt)}</td>
                      <td>{formatDateTime(run.completedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
