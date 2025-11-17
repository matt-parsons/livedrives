import { notFound, redirect } from 'next/navigation';
import { AuthError, requireAuth } from '@/lib/authServer';
import { loadBusiness, loadOrganizationBusinesses } from './helpers';
import { BusinessLayoutProvider } from './BusinessLayoutContext';

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

  const business = await loadBusiness(session, identifier);

  if (!business) {
    notFound();
  }

  const organizationBusinesses = await loadOrganizationBusinesses(session);
  const businessOptions = organizationBusinesses.map((entry) => ({
    id: entry.id,
    value: entry.businessSlug ?? String(entry.id),
    label: entry.businessName || `Business #${entry.id}`,
    isActive: entry.isActive
  }));

  const businessIdentifier = business.businessSlug ?? String(business.id);
  const currentBusinessOptionValue = businessIdentifier;
  const showBusinessSwitcher = businessOptions.length > 1;
  const canManageSettings = session.role === 'owner' || session.role === 'admin';
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
