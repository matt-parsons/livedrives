import { notFound, redirect } from 'next/navigation';
import { AuthError, requireAuth } from '@/lib/authServer';
import { loadBusiness, loadOrganizationBusinesses, loadSubscription, loadOrganizationTrial } from './helpers';
import { BusinessLayoutProvider } from './BusinessLayoutContext';
import { warmBusinessReviewSnapshot } from './reviews/reviewSnapshot';

export default async function BusinessLayout({ children, params }) {
  const identifier = params.business;

  let session;

  try {
    session = await requireAuth();
  } catch (error) {
    if (error instanceof AuthError && error.statusCode >= 400 && error.statusCode < 500) {
      redirect('/signin');
    }

    throw error;
  }

  const isAdmin = session.role === 'admin';
  let hasSubscription = false;
  let hasTrial = false;

  if (!isAdmin) {
    const [subscription, trial] = await Promise.all([
      loadSubscription(session.organizationId),
      loadOrganizationTrial(session.organizationId)
    ]);

    hasSubscription = subscription && subscription.subscription_status === 'active';
    hasTrial = trial && trial.status === 'active' && new Date(trial.trial_ends_at) > new Date();

    if (!hasSubscription && !hasTrial) {
      redirect('/dashboard/upgrade');
    }
  }

  const business = await loadBusiness(session, identifier);

  if (!business) {
    notFound();
  }

  warmBusinessReviewSnapshot(business).catch((error) => {
    console.error('Failed to warm business review snapshot', error);
  });

  const organizationBusinesses = await loadOrganizationBusinesses(session);
  const businessOptions = organizationBusinesses.map((entry) => ({
    id: entry.id,
    value: String(entry.id),
    label: entry.businessName || `Business #${entry.id}`,
    isActive: entry.isActive
  }));

  const businessIdentifier = business.businessSlug ?? String(business.id);
  const currentBusinessOptionValue = String(business.id);
  const showBusinessSwitcher = businessOptions.length > 1;
  const canManageSettings = session.role === 'admin';
  const businessName = business.businessName || 'Business';
  const destination = business.destinationAddress
    ? `${business.destinationAddress}${business.destinationZip ? `, ${business.destinationZip}` : ''}`
    : null;
  const locationLabel = destination ?? null;

  const layoutContextValue = {
    businessName,
    locationLabel,
    canManageSettings,
    showBusinessSwitcher,
    businessIdentifier,
    businessOptions,
    currentBusinessOptionValue
  };

  return (
    <BusinessLayoutProvider value={layoutContextValue}>
      <div className="dashboard-layout">{children}</div>
    </BusinessLayoutProvider>
  );
}
