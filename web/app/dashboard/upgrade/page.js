import { notFound, redirect } from 'next/navigation';
import { AuthError, requireAuth } from '@/lib/authServer';

import BusinessNavigation from '@/app/dashboard/[business]/BusinessNavigation';
import DashboardBusinessHeader from '@/app/dashboard/[business]/DashboardBusinessHeader';
import SidebarBrand from '@/app/dashboard/[business]/SidebarBrand';
import {
  loadBusiness,
  loadBusinessHours,
  loadOriginZones,
  loadSoaxConfig,
  loadGeoGridSchedule,
  loadGeoGridRunSummaries,
  formatDate,
  formatDecimal
} from '@/app/dashboard/[business]/helpers';


export default async function UpgradePage({ params }) {
  // console.log('params', params);
  // const identifier = params.business;
  // let session;

  // try {
  //   session = await requireAuth();
  // } catch (error) {
  //   if (error instanceof AuthError && error.statusCode >= 400 && error.statusCode < 500) {
  //     redirect('/signin');
  //   }

  //   throw error;
  // }

  // const business = await loadBusiness(session, identifier);

  // if (!business) {
  //   notFound();
  // }

  // const businessIdentifier = business.businessSlug ?? String(business.id);

  return (
    <div className="dashboard-layout__body">
      <aside className="dashboard-layout__sidebar" aria-label="Workspace navigation">
        <SidebarBrand />
        <div className="dashboard-sidebar__menu">
          <BusinessNavigation businessIdentifier={'businessIdentifier'} active="dashboard" />
        </div>
      </aside>

      <main className="dashboard-layout__main">
        {/* <DashboardBusinessHeader organizationId={session.organizationId} /> */}
        <div className="dashboard-layout__content">
          <div className="flex min-h-screen flex-col items-center justify-center p-24">
            <h1 className="text-4xl font-bold">Upgrade Your Plan</h1>
            <p className="mt-4 text-lg">This page will contain information about upgrading your subscription.</p>
            {/* Stripe integration will go here */}
          </div>
        </div>
      </main>
    </div>
  );
}
