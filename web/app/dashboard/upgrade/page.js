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
              <div className="flex flex-col items-center justify-center gap-8 p-12 text-center">
                <div>
                  <h1 className="text-4xl font-bold">Simple, Transparent Pricing</h1>
                  <p className="mt-4 text-lg text-slate-700">
                    Get More Calls, No Ad Spend Required!
                  </p>
                </div>
                <div className="flex w-full max-w-4xl justify-center items-center">

                <section aria-label="Starter pricing" className="w-full max-w-sm text-left mt-8 mb-8">
                  <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">

                    <div className="mt-3 flex items-baseline gap-2">
                      <span className="text-6xl font-extrabold tracking-tight text-slate-900">$247</span>
                      <span className="text-lg font-semibold text-slate-600">/month</span>
                    </div>

                    <p className="mt-3 text-base text-slate-600">Maximum flexibility.</p>

                    <ul className="mt-8 space-y-4">
                      {[
                        'Local Rank Tracker',
                        'Google Business Profile (GBP) AI Checklist',
                        'Reputation Monitoring',
                        'Competitor Tracking',
                        '1 Business Location',
                        'VIP Support',
                        '1 HR Private Onboarding',
                        '7 day free trial'
                      ].map((label) => (
                        <li key={label} className="flex items-start gap-3 text-slate-800">
                          <span className="mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full bg-blue-600">
                            <svg
                              viewBox="0 0 20 20"
                              fill="none"
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-3.5 w-3.5"
                              aria-hidden="true"
                            >
                              <path
                                d="M16.25 5.75L8.375 13.625L3.75 9"
                                stroke="white"
                                strokeWidth="2.25"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </span>
                          <span className="text-base font-medium leading-snug">{label}</span>
                        </li>
                      ))}
                    </ul>

                    <div className="mt-10">
                      <UpgradeCheckoutButton priceId={process.env.STRIPE_MO_PRICE_ID} />
                    </div>
                  </div>
                </section>
                <section aria-label="Starter pricing" className="w-full max-w-sm text-left">
                  <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                    <div className="border bg-primary p-4 mb-8 text-white text-center">BEST VALUE</div>

                    <div className="mt-3 flex items-baseline gap-2 px-8">
                      <span className="text-6xl font-extrabold tracking-tight text-slate-900">$205</span>
                      <span className="text-lg font-semibold text-slate-600">/month</span>
                    </div>

                    <p className="mt-3 text-base text-slate-600 px-8">Get 2 months free – Billed as $2,470/year</p>

                    <ul className="mt-8 space-y-4 px-8">
                      {[
                        'Local Rank Tracker',
                        'Google Business Profile (GBP) AI Checklist',
                        'Reputation Monitoring',
                        'Competitor Tracking',
                        '1 Business Location',
                        'VIP Support',
                        '1 HR Private Onboarding',
                        '7 day free trial'
                      ].map((label) => (
                        <li key={label} className="flex items-start gap-3 text-slate-800">
                          <span className="mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full bg-blue-600">
                            <svg
                              viewBox="0 0 20 20"
                              fill="none"
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-3.5 w-3.5"
                              aria-hidden="true"
                            >
                              <path
                                d="M16.25 5.75L8.375 13.625L3.75 9"
                                stroke="white"
                                strokeWidth="2.25"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </span>
                          <span className="text-base font-medium leading-snug">{label}</span>
                        </li>
                      ))}
                    </ul>

                    <div className="mt-10 p-8">
                      <UpgradeCheckoutButton priceId={process.env.STRIPE_YR_PRICE_ID} buttonTxt='Go Annual & Save' />
                    </div>
                  </div>
                </section>
                </div>       
                <UpgradeStripeSync sessionId={checkoutSessionId} />
              </div>
            </div>
          </main>
        </div>
      </div>
    </BusinessLayoutProvider>
  );
}
