import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthError, requireAuth } from '@/lib/authServer';
import BusinessForm from '../businesses/BusinessForm';
import BusinessOptimizationRoadmap from '../[business]/BusinessOptimizationRoadmap';
import { loadOptimizationData } from '@/lib/optimizationData';
import { loadJourneyBusinessContext, loadTrialStatus } from './helpers';
import KeywordOriginZoneForm from './KeywordOriginZoneForm';
import { Button } from '@/components/ui/button';

export const metadata = {
  title: 'Member journey · Local Paint Pilot'
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
          Enjoy full access to dashboards, GBP optimization insights, and geo grid tools for 7 days. We'll prompt you
          before the trial ends.
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
    ? encodeURIComponent(primaryBusiness.businessSlug ?? String(primaryBusiness.id))
    : null;
  const businessHref = defaultIdentifier ? `/dashboard/${defaultIdentifier}` : null;
  const editHref = defaultIdentifier ? `${businessHref}/edit` : null;

  let optimizationRoadmap = null;
  let optimizationError = null;

  if (primaryBusiness?.gPlaceId) {
    try {
      const { roadmap } = await loadOptimizationData(primaryBusiness.gPlaceId);
      optimizationRoadmap = roadmap;
    } catch (error) {
      optimizationRoadmap = null;
      optimizationError = error?.message ?? 'Failed to load Google Places data.';
    }
  }

  const existingZone = originZones.length ? originZones[0] : null;

  return (
    <div className="page-shell">
      <section className="page-header">
        <h1 className="page-title">Member journey</h1>
        <p className="page-subtitle">
          Launch your Local Paint Pilot workspace in four quick steps. We'll capture a 7 day trial, your business
          profile, GBP roadmap insights, and the first origin zone keyword.
        </p>
      </section>

      <StepSection
        step="1"
        title="Start your free 7 day trial"
        intro="We automatically activate a trial for every new organization."
      >
        <TrialStatusCard trial={trial} />
      </StepSection>

      <StepSection
        step="2"
        title="Register your business details"
        intro="Add the business we should optimize. You can refine the record anytime."
      >
        {primaryBusiness ? (
          <div className="grid gap-4 text-sm text-muted-foreground">
            <div className="rounded-lg border border-border/60 bg-background/80 p-4 shadow-sm">
              <p className="text-base font-semibold text-foreground">{primaryBusiness.businessName}</p>
              <p className="mt-1">{primaryBusiness.destinationAddress || 'Destination address pending'}</p>
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
        ) : (
          <div className="rounded-lg border border-dashed border-border/70 bg-background/40 p-4 shadow-sm">
            <BusinessForm mode="create" />
          </div>
        )}
      </StepSection>

      <StepSection
        step="3"
        title="Review your GBP optimization roadmap"
        intro="Connect your Google Place ID to unlock guided profile improvements."
      >
        {!primaryBusiness ? (
          <p className="text-sm text-muted-foreground">
            Add a business first so we can evaluate its Google Business Profile and surface roadmap tasks.
          </p>
        ) : primaryBusiness.gPlaceId ? (
          <BusinessOptimizationRoadmap
            roadmap={optimizationRoadmap}
            error={optimizationError}
            placeId={primaryBusiness.gPlaceId}
            editHref={editHref ?? undefined}
          />
        ) : (
          <div className="rounded-lg border border-border/60 bg-background/60 p-4 text-sm text-muted-foreground shadow-sm">
            <p className="font-medium text-foreground">Link a Google Place ID</p>
            <p className="mt-1">
              Add the Place ID on the business edit screen to generate automated GBP optimization tasks tailored to your
              listing.
            </p>
            {editHref ? (
              <Button asChild size="sm" className="mt-3" variant="secondary">
                <Link href={editHref}>Add Place ID</Link>
              </Button>
            ) : null}
          </div>
        )}
      </StepSection>

      <StepSection
        step="4"
        title="Create your first origin zone keyword"
        intro="Seed geo coverage with one high-impact keyword. We'll pin it to the business location with a 3 mile radius."
      >
        {!primaryBusiness ? (
          <p className="text-sm text-muted-foreground">
            Once your business profile is saved we can generate the default origin zone and start geo grid tracking.
          </p>
        ) : (
          <KeywordOriginZoneForm
            businessId={primaryBusiness.id}
            businessName={primaryBusiness.businessName}
            destinationAddress={primaryBusiness.destinationAddress}
            destinationZip={primaryBusiness.destinationZip}
            destLat={primaryBusiness.destLat}
            destLng={primaryBusiness.destLng}
            existingZone={existingZone}
            manageHref={businessHref}
          />
        )}
      </StepSection>
    </div>
  );
}
