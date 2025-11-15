import { notFound, redirect } from 'next/navigation';
import { AuthError, requireAuth } from '@/lib/authServer';
import BusinessNavigation from '../BusinessNavigation';
import BusinessForm from '../../businesses/BusinessForm';
import BusinessHoursForm from '../BusinessHoursForm';
import OriginZonesManager from '../OriginZonesManager';
import SoaxConfigForm from '../SoaxConfigForm';
import GeoGridScheduleCard from '../GeoGridScheduleCard';
import {
  loadBusiness,
  loadBusinessHours,
  loadOriginZones,
  loadSoaxConfig,
  loadGeoGridSchedule
} from '../helpers';

export const metadata = {
  title: 'Business settings · Local Paint Pilot'
};

export default async function BusinessSettingsPage({ params }) {
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

  const business = await loadBusiness(session.organizationId, identifier);

  if (!business) {
    notFound();
  }

  const canManageSettings = session.role === 'owner' || session.role === 'admin';

  if (!canManageSettings) {
    redirect(`/dashboard/${encodeURIComponent(identifier)}`);
  }

  const [businessHours, originZones, soaxConfig, geoGridSchedule] = await Promise.all([
    loadBusinessHours(business.id),
    loadOriginZones(business.id),
    loadSoaxConfig(business.id),
    loadGeoGridSchedule(business.id)
  ]);

  const initialValues = {
    ...business,
    brandSearch: business.brandSearch ?? '',
    gPlaceId: business.gPlaceId ?? '',
    isActive: business.isActive === true || business.isActive === 1
  };

  const businessIdentifier = business.businessSlug ?? String(business.id);
  const businessName = business.businessName || 'Business';

  const originZonesCaption = originZones.length === 0
    ? 'Define origin zones to balance coverage and routing priorities.'
    : 'Targeted pickup regions shaping this business’s live operations.';

  return (
    <div className="dashboard-layout__body">
        <aside className="dashboard-layout__sidebar" aria-label="Workspace navigation">
          <div className="dashboard-sidebar__menu">
            <BusinessNavigation businessIdentifier={businessIdentifier} active="settings" />
          </div>
        </aside>

        <main className="dashboard-layout__main">
          <div className="dashboard-layout__content">
            <header className="dashboard-page-header">
              <div className="dashboard-page-header__intro">
                <h2 className="page-title">Business settings</h2>
                <p className="page-subtitle">
                  Manage contact details, service availability, origin zones, and SOAX proxy credentials for {businessName}.
                </p>
              </div>
            </header>

            <section className="section">
              <div className="section-header">
                <h2 className="section-title">Business profile</h2>
                <p className="section-caption">Review and adjust general details for this business.</p>
              </div>

              <div className="surface-card surface-card--muted">
                <BusinessForm mode="edit" businessId={business.id} initialValues={initialValues} />
              </div>
            </section>

            <section className="section">
              <div className="section-header">
                <h2 className="section-title">Business hours</h2>
                <p className="section-caption">
                  Keep opening hours accurate to ensure availability windows sync across operations tools.
                </p>
              </div>

              <div className="surface-card surface-card--muted">
                <BusinessHoursForm businessId={business.id} initialHours={businessHours} />
              </div>
            </section>

            <section className="section">
              <GeoGridScheduleCard
                businessId={business.id}
                schedule={geoGridSchedule}
                timezone={business.timezone}
                isBusinessActive={business.isActive === true || business.isActive === 1}
                canEdit={session.role === 'owner'}
              />
            </section>

            <section className="section">
              <OriginZonesManager businessId={business.id} initialZones={originZones} caption={originZonesCaption} />
            </section>

            <section className="section">
              <div className="section-header">
                <h2 className="section-title">SOAX configuration</h2>
                <p className="section-caption">
                  Configure the proxy credentials used when running ranking reports and CTR sessions for this business.
                </p>
              </div>

              <div className="surface-card surface-card--muted">
                <SoaxConfigForm businessId={business.id} initialConfig={soaxConfig} />
              </div>
            </section>
          </div>
        </main>
      </div>
  );
}
