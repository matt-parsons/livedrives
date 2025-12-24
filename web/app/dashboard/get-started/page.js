import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthError, requireAuth } from '@/lib/authServer';
import BusinessForm from '../businesses/BusinessForm';
import BusinessCapturePanel from './BusinessCapturePanel';
import { loadJourneyBusinessContext, loadTrialStatus } from './helpers';
import { Button } from '@/components/ui/button';

export const metadata = {
  title: 'Get Set Up · Local Paint Pilot'
};

function formatDateLabel(date) {
  if (!date) {
    return '—';
  }

  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }).format(date);
  } catch (error) {
    return date.toISOString().split('T')[0];
  }
}

function StepSection({ step, title, intro, children }) {
  return (
    <section className="section">
      <div className="rounded-2xl border border-border/60 bg-card/90 p-6 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
                {step}
              </div>
              <div>
                <h2 className="text-xl font-semibold text-foreground">{title}</h2>
                {intro ? <p className="text-sm text-muted-foreground">{intro}</p> : null}
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-4">{children}</div>
        </div>
      </div>
    </section>
  );
}

function TrialStatusCard({ trial }) {
  if (!trial) {
    return (
      <div className="rounded-lg border border-dashed border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Trial pending</p>
        <p className="mt-1">
          Your 7 day Local Paint Pilot trial will start automatically once your organization is created.
        </p>
      </div>
    );
  }

  const statusLabel = trial.isActive
    ? `Active · ${trial.daysRemaining ?? 0} day${trial.daysRemaining === 1 ? '' : 's'} left`
    : trial.isExpired
      ? 'Expired'
      : 'Scheduled';

  const statusTone = trial.isActive
    ? 'text-emerald-600'
    : trial.isExpired
      ? 'text-destructive'
      : 'text-muted-foreground';

  return (
    <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
      <div className="rounded-md border border-border/60 bg-background/60 p-4 shadow-sm">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Trial status</p>
        <p className={`text-base font-semibold ${statusTone}`}>{statusLabel}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Trial started {formatDateLabel(trial.trialStartsAt)} · Ends {formatDateLabel(trial.trialEndsAt)}
        </p>
      </div>
      <div className="rounded-md border border-border/60 bg-background/60 p-4 shadow-sm">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">What to expect</p>
        <p>
          You get full access to dashboards, GBP insights, heatmaps, and ranking reports to start getting more customers.
        </p>
      </div>
    </div>
  );
}

export default async function MemberJourneyPage() {
  let session;

  try {
    session = await requireAuth();
  } catch (error) {
    if (error instanceof AuthError && error.statusCode >= 400 && error.statusCode < 500) {
      redirect('/signin');
    }

    throw error;
  }

  const [trial, businessContext] = await Promise.all([
    loadTrialStatus(session.organizationId),
    loadJourneyBusinessContext(session.organizationId)
  ]);

  const { primaryBusiness, originZones } = businessContext;
  const defaultIdentifier = primaryBusiness
    ? primaryBusiness.businessSlug ?? String(primaryBusiness.id)
    : null;
  const businessHref = primaryBusiness
    ? `/dashboard?bId=${encodeURIComponent(primaryBusiness.id)}`
    : null;
  const editHref = defaultIdentifier
    ? `/dashboard/${encodeURIComponent(defaultIdentifier)}/edit`
    : null;

  const shouldRedirectToDashboard =
    Boolean(primaryBusiness) && originZones.length > 0 && Boolean(businessHref);

  if (shouldRedirectToDashboard) {
    redirect(businessHref);
  }

  return (
    <div className="page-shell">
      <section className="page-header">
        <h1 className="page-title">Get Set Up</h1>
        <p className="page-subtitle">
          Set up your account so you can start improving your Google rankings and <strong>get more customers</strong>.
        </p>
      </section>

      <StepSection
        step="1"
        title="Add your business"
        intro="Search for your business name or address. We&apos;ll fill in the details automatically."
      >
        {primaryBusiness ? (
          <div className="grid gap-4">
            <div className="grid gap-4 text-sm text-muted-foreground">
              <div className="rounded-lg border border-border/60 bg-background/80 p-4 shadow-sm">
                <p className="text-base font-semibold text-foreground">{primaryBusiness.businessName}</p>
                <p className="mt-1">
                  {primaryBusiness.destinationAddress || 'Destination address pending'}
                </p>
                <div className="mt-2 flex flex-wrap gap-3 text-xs uppercase tracking-wide text-muted-foreground">
                  <span>Timezone: {primaryBusiness.timezone || '—'}</span>
                  <span>Drives/day: {primaryBusiness.drivesPerDay ?? '0'}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                {businessHref ? (
                  <Button asChild>
                    <Link href={businessHref}>Open business dashboard</Link>
                  </Button>
                ) : null}
                {editHref ? (
                  <Button asChild variant="outline">
                    <Link href={editHref}>Edit business</Link>
                  </Button>
                ) : null}
              </div>
            </div>
            <BusinessCapturePanel business={primaryBusiness} businessHref={businessHref} />
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border/70 bg-background/40 p-4 shadow-sm">
            <BusinessForm mode="create" searchOnly />
          </div>
        )}
      </StepSection>

    </div>
  );
}
