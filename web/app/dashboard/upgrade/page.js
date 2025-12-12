import { redirect } from 'next/navigation';
import { AuthError, requireAuth } from '@/lib/authServer';

import BusinessNavigation from '@/app/dashboard/[business]/BusinessNavigation';
import DashboardBusinessHeader from '@/app/dashboard/[business]/DashboardBusinessHeader';
import SidebarBrand from '@/app/dashboard/[business]/SidebarBrand';
import { BusinessLayoutProvider } from '@/app/dashboard/[business]/BusinessLayoutContext';
import UpgradeCheckoutButton from './UpgradeCheckoutButton';
import UpgradeStripeSync from './UpgradeStripeSync';
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

export default async function UpgradePage({ searchParams }) {
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
    value: entry.businessSlug ?? String(entry.id),
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
    currentBusinessOptionValue: businessIdentifier
  };

  const checkoutSessionId = searchParams?.session_id ?? null;

  return (
    <BusinessLayoutProvider value={businessLayoutValue}>
      <div className="dashboard-layout">
        <div className="dashboard-layout__body">
          <aside className="dashboard-layout__sidebar" aria-label="Workspace navigation">
            <SidebarBrand />
            <div className="dashboard-sidebar__menu">
              <BusinessNavigation businessIdentifier={businessIdentifier} active="dashboard" />
            </div>
          </aside>

          <main className="dashboard-layout__main">
            <DashboardBusinessHeader organizationId={session.organizationId} />
            <div className="dashboard-layout__content">
              <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-12 text-center">
                <div>
                  <h1 className="text-4xl font-bold">Upgrade Your Plan</h1>
                  <p className="mt-4 text-lg text-slate-700">
                    Activate billing to continue using LiveDrives without interruption.
                  </p>
                </div>

                <UpgradeCheckoutButton />
                <UpgradeStripeSync sessionId={checkoutSessionId} />
              </div>
            </div>
          </main>
        </div>
      </div>
    </BusinessLayoutProvider>
  );
}
