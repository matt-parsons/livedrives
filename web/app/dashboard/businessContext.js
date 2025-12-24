import { notFound, redirect } from 'next/navigation';
import { AuthError, requireAuth } from '@/lib/authServer';
import {
  isNumericIdentifier,
  loadBusiness,
  loadOrganizationBusinesses,
  loadSubscription,
  loadOrganizationTrial
} from './[business]/helpers';
import { warmBusinessReviewSnapshot } from './[business]/reviews/reviewSnapshot';

function selectDefaultBusiness(session, businesses) {
  if (!Array.isArray(businesses) || businesses.length === 0) {
    return null;
  }

  const defaultBusinessId = session?.defaultBusinessId;
  const numericDefaultId = defaultBusinessId != null ? Number(defaultBusinessId) : null;

  if (Number.isFinite(numericDefaultId)) {
    const match = businesses.find((business) => Number(business.id) === numericDefaultId);

    if (match) {
      return match;
    }
  }

  const firstActive = businesses.find((business) => business.isActive);

  return firstActive ?? businesses[0] ?? null;
}

function resolveRequestedBusinessId(searchParams) {
  const rawValue = Array.isArray(searchParams?.bId)
    ? searchParams.bId[0]
    : searchParams?.bId;

  if (!rawValue) {
    return null;
  }

  return isNumericIdentifier(rawValue) ? rawValue : null;
}

export async function resolveDashboardBusinessContext({ searchParams } = {}) {
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

  const requestedBusinessId = resolveRequestedBusinessId(searchParams);
  let business = null;

  if (requestedBusinessId) {
    business = await loadBusiness(session, requestedBusinessId);

    if (!business) {
      notFound();
    }
  }

  const organizationBusinesses = await loadOrganizationBusinesses(session);

  if (!organizationBusinesses.length) {
    redirect('/dashboard/get-started');
  }

  if (!business) {
    const defaultBusiness = selectDefaultBusiness(session, organizationBusinesses);

    if (!defaultBusiness) {
      return {
        session,
        business: null,
        organizationBusinesses,
        layoutContextValue: null
      };
    }

    const identifier = defaultBusiness.businessSlug ?? String(defaultBusiness.id);
    business = await loadBusiness(session, identifier);
  }

  if (!business) {
    notFound();
  }

  warmBusinessReviewSnapshot(business).catch((error) => {
    console.error('Failed to warm business review snapshot', error);
  });

  const businessOptions = organizationBusinesses.map((entry) => ({
    id: entry.id,
    value: String(entry.id),
    label: entry.businessName || `Business #${entry.id}`,
    isActive: entry.isActive
  }));

  const businessIdentifier = business.businessSlug ?? String(business.id);
  const showBusinessSwitcher = businessOptions.length > 1;
  const canManageSettings = session.role === 'admin';
  const destination = business.destinationAddress
    ? `${business.destinationAddress}${business.destinationZip ? `, ${business.destinationZip}` : ''}`
    : null;
  const locationLabel = destination ?? null;

  const layoutContextValue = {
    businessName: business.businessName || 'Business',
    locationLabel,
    canManageSettings,
    showBusinessSwitcher,
    businessIdentifier,
    businessOptions,
    currentBusinessOptionValue: String(business.id)
  };

  return {
    session,
    business,
    organizationBusinesses,
    layoutContextValue
  };
}
