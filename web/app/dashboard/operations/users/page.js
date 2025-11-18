import { redirect } from 'next/navigation';
import { AuthError, requireAuth } from '@/lib/authServer';
import { loadTrialStatus } from '@/app/dashboard/get-started/helpers';
import { loadOrganizationMembers, loadOrganizationSubscription } from './helpers';
import UserDirectoryTable from './UserDirectoryTable';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata = {
  title: 'User directory · Local Paint Pilot'
};

function formatDateLabel(isoString) {
  if (!isoString) {
    return '—';
  }

  try {
    const date = new Date(isoString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }).format(date);
  } catch (error) {
    return isoString;
  }
}

function SubscriptionSummaryCard({ subscription, trial }) {
  const status = subscription?.status || (trial?.isActive ? 'trialing' : null) || 'not_provisioned';
  const statusLabel =
    status === 'trialing'
      ? 'Trialing'
      : status === 'active'
        ? 'Active subscription'
        : status === 'past_due'
          ? 'Past due'
          : status === 'cancelled'
            ? 'Cancelled'
            : 'Not provisioned';

  const toneClass =
    status === 'active'
      ? 'text-emerald-600'
      : status === 'past_due'
        ? 'text-amber-600'
        : status === 'cancelled'
          ? 'text-destructive'
          : status === 'trialing'
            ? 'text-sky-600'
            : 'text-muted-foreground';

  const planLabel = subscription?.plan || 'Plan pending';
  const renewsLabel = subscription?.renewsAt ? formatDateLabel(subscription.renewsAt) : '—';

  return (
    <Card className="border-border/70 bg-card/90 shadow-sm">
      <CardHeader>
        <CardTitle className="text-xl">Subscription status</CardTitle>
        <CardDescription>Track billing readiness for this organization.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-muted-foreground">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Status</p>
          <p className={`text-base font-semibold ${toneClass}`}>{statusLabel}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-border/60 bg-background/60 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Plan</p>
            <p className="text-base font-semibold text-foreground">{planLabel}</p>
          </div>
          <div className="rounded-md border border-border/60 bg-background/60 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Next renewal</p>
            <p className="text-base font-semibold text-foreground">{renewsLabel}</p>
          </div>
        </div>
        {subscription?.cancelledAt ? (
          <p className="text-xs text-destructive">
            Cancellation scheduled {formatDateLabel(subscription.cancelledAt)}.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function TrialSummaryCard({ trial }) {
  if (!trial) {
    return (
      <Card className="border-dashed border-border/70 bg-card/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl">Trial status</CardTitle>
          <CardDescription>We&apos;ll spin up your 7 day trial automatically.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No trial is active yet. Invite a team member or add a business to start your guided onboarding.
          </p>
        </CardContent>
      </Card>
    );
  }

  const statusLabel = trial.isActive
    ? `Active · ${trial.daysRemaining ?? 0} day${trial.daysRemaining === 1 ? '' : 's'} left`
    : trial.isExpired
      ? 'Expired'
      : 'Scheduled';

  const toneClass = trial.isActive ? 'text-emerald-600' : trial.isExpired ? 'text-destructive' : 'text-muted-foreground';

  return (
    <Card className="border-border/70 bg-card/90 shadow-sm">
      <CardHeader>
        <CardTitle className="text-xl">Trial status</CardTitle>
        <CardDescription>Monitor your 7 day Local Paint Pilot trial window.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Status</p>
          <p className={`text-base font-semibold ${toneClass}`}>{statusLabel}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-border/60 bg-background/60 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Trial start</p>
            <p className="text-base font-semibold text-foreground">{formatDateLabel(trial.trialStartsAt)}</p>
          </div>
          <div className="rounded-md border border-border/60 bg-background/60 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Trial end</p>
            <p className="text-base font-semibold text-foreground">{formatDateLabel(trial.trialEndsAt)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default async function AdminUserDirectoryPage() {
  let session;

  try {
    session = await requireAuth();
  } catch (error) {
    if (error instanceof AuthError && error.statusCode >= 400 && error.statusCode < 500) {
      redirect('/signin');
    }

    throw error;
  }

  if (session.actualRole !== 'admin') {
    redirect('/dashboard');
  }

  const [members, trial, subscription] = await Promise.all([
    loadOrganizationMembers(session.organizationId),
    loadTrialStatus(session.organizationId),
    loadOrganizationSubscription(session.organizationId)
  ]);

  const membersWithContext = members.map((member) => ({
    ...member,
    isSelf: member.id === session.userId
  }));

  return (
    <div className="page-shell">
      <section className="page-header">
        <h1 className="page-title">User directory</h1>
        <p className="page-subtitle">
          View every member in your workspace, reset credentials, and remove access with confidence.
        </p>
      </section>

      <section className="section">
        <div className="grid gap-4 lg:grid-cols-2">
          <SubscriptionSummaryCard subscription={subscription} trial={trial} />
          <TrialSummaryCard trial={trial} />
        </div>
      </section>

      <section className="section">
        <UserDirectoryTable
          members={membersWithContext}
          organizationName={subscription?.name || 'Workspace'}
        />
      </section>
    </div>
  );
}
