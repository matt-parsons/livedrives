import { redirect } from 'next/navigation';
import BusinessNavigation from '@/app/dashboard/[business]/BusinessNavigation';
import DashboardBusinessHeader from '@/app/dashboard/[business]/DashboardBusinessHeader';
import SidebarBrand from '@/app/dashboard/[business]/SidebarBrand';
import { BusinessLayoutProvider } from '@/app/dashboard/[business]/BusinessLayoutContext';
import UpgradeStripeSync from '../UpgradeStripeSync';
import { resolveUpgradeBusinessContext } from '../upgradeContext';

export default async function UpgradeSuccessPage({ searchParams }) {
  const { session, business, businessLayoutValue } = await resolveUpgradeBusinessContext();
  const checkoutSessionId = searchParams?.session_id ?? null;

  if (!checkoutSessionId) {
    redirect('/dashboard/upgrade');
  }

  return (
    <BusinessLayoutProvider value={businessLayoutValue}>
      <div className="dashboard-layout">
        <div className="dashboard-layout__body">
          <aside className="dashboard-layout__sidebar" aria-label="Workspace navigation">
            <SidebarBrand />
            <div className="dashboard-sidebar__menu">
              <BusinessNavigation businessId={business.id} active="dashboard" />
            </div>
          </aside>

          <main className="dashboard-layout__main">
            <DashboardBusinessHeader organizationId={session.organizationId} />
            <div className="dashboard-layout__content">
              <div className="flex flex-col items-center justify-center gap-4 p-12 text-center">
                <h1 className="text-3xl font-semibold text-slate-900">Processing your upgrade</h1>
                <p className="text-base text-slate-600">
                  Hold tight while we confirm your subscription and unlock your dashboard.
                </p>
                <UpgradeStripeSync sessionId={checkoutSessionId} />
              </div>
            </div>
          </main>
        </div>
      </div>
    </BusinessLayoutProvider>
  );
}
