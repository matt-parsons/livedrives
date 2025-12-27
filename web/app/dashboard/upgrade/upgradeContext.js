import { redirect } from 'next/navigation';
import { AuthError, requireAuth } from '@/lib/authServer';
import { loadBusiness, loadOrganizationBusinesses } from '@/app/dashboard/[business]/helpers';

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

export async function resolveUpgradeBusinessContext() {
  let session;

  try {
    session = await requireAuth();
  } catch (error) {
    if (error instanceof AuthError && error.statusCode >= 400 && error.statusCode < 500) {
      redirect('/signin');
    }

    throw error;
  }

  const businesses = await loadOrganizationBusinesses(session);

  if (!businesses.length) {
    redirect('/dashboard/get-started');
  }

  const defaultBusiness = selectDefaultBusiness(session, businesses);

  if (!defaultBusiness) {
    redirect('/dashboard');
  }

  const businessIdentifier = defaultBusiness.businessSlug ?? String(defaultBusiness.id);
  const business = await loadBusiness(session, businessIdentifier);

  if (!business) {
    redirect('/dashboard');
  }

  const businessOptions = businesses.map((entry) => ({
    id: entry.id,
    value: String(entry.id),
    label: entry.businessName || `Business #${entry.id}`,
    isActive: entry.isActive
  }));

  const destination = business.destinationAddress
    ? `${business.destinationAddress}${business.destinationZip ? `, ${business.destinationZip}` : ''}`
    : null;

  const businessLayoutValue = {
    businessName: business.businessName || 'Business',
    locationLabel: destination ?? null,
    canManageSettings: session.role === 'admin',
    showBusinessSwitcher: businessOptions.length > 1,
    businessIdentifier,
    businessOptions,
    currentBusinessOptionValue: String(business.id)
  };

  return {
    session,
    business,
    businessLayoutValue
  };
}
