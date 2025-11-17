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
  loadGeoGridSchedule,
  loadGeoGridRunSummaries,
  formatDate,
  formatDecimal
} from '../helpers';
import UserAccountSettings from './UserAccountSettings';
import SidebarBrand from '../SidebarBrand';
import DashboardBusinessHeader from '../DashboardBusinessHeader';

function formatCoordinate(value, digits = 5) {
  if (value === null || value === undefined) {
    return null;
  }

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return String(value);
  }

  return formatDecimal(numericValue, digits);
}

function buildCoordinatePair(lat, lng, digits = 5) {
  const latFormatted = formatCoordinate(lat, digits);
  const lngFormatted = formatCoordinate(lng, digits);

  if (!latFormatted || !lngFormatted) {
    return null;
  }

  return `${latFormatted}, ${lngFormatted}`;
}

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

  const business = await loadBusiness(session, identifier);

  if (!business) {
    notFound();
  }

  const canManageSettings = session.role === 'owner' || session.role === 'admin';

  if (!canManageSettings) {
    redirect(`/dashboard/${encodeURIComponent(identifier)}`);
  }

  const [businessHours, originZones, soaxConfig, geoGridSchedule, geoGridRuns] = await Promise.all([
    loadBusinessHours(business.id),
    loadOriginZones(business.id),
    loadSoaxConfig(business.id),
    loadGeoGridSchedule(business.id),
    loadGeoGridRunSummaries(business.id)
  ]);

  const initialValues = {
    ...business,
    brandSearch: business.brandSearch ?? '',
    gPlaceId: business.gPlaceId ?? '',
    isActive: business.isActive === true || business.isActive === 1
  };

  const businessIdentifier = business.businessSlug ?? String(business.id);
  const businessName = business.businessName || 'Business';
  const businessStatus = business.isActive ? { key: 'active', label: 'Active' } : { key: 'inactive', label: 'Inactive' };
  const destination = business.destinationAddress
    ? `${business.destinationAddress}${business.destinationZip ? `, ${business.destinationZip}` : ''}`
    : null;
  const destinationCoordinates = buildCoordinatePair(business.destLat, business.destLng);
  const createdAt = formatDate(business.createdAt);
  const updatedAt = formatDate(business.updatedAt);

  const highlightTiles = [
    { label: 'Local Rankings', value: geoGridRuns.length },
    { label: 'Origin Zones', value: originZones.length },
    { label: 'Business Status', value: businessStatus.label, status: businessStatus.key }
  ];

  if (business.drivesPerDay !== null && business.drivesPerDay !== undefined) {
    highlightTiles.push({ label: 'Drives / day', value: business.drivesPerDay });
  }

  const infoBlocks = [
    { label: 'Business ID', value: business.id },
    business.businessSlug ? { label: 'Slug', value: business.businessSlug } : null,
    business.mid ? { label: 'MID', value: business.mid } : null,
    business.timezone ? { label: 'Timezone', value: business.timezone } : null,
    destination ? { label: 'Destination', value: destination } : null,
    destinationCoordinates ? { label: 'Destination coordinates', value: destinationCoordinates } : null,
    createdAt ? { label: 'Created', value: createdAt } : null,
    updatedAt ? { label: 'Updated', value: updatedAt } : null
  ].filter(Boolean);

  const businessOverviewItems = [
    ...highlightTiles.map((tile) => ({
      key: tile.label,
      label: tile.label,
      value: tile.value,
      status: tile.status ?? null
    })),
    ...infoBlocks.map((item) => ({
      key: item.label,
      label: item.label,
      value: item.value,
      status: null
    }))
  ];

  const originZonesCaption = originZones.length === 0
    ? 'Define origin zones to balance coverage and routing priorities.'
    : 'Targeted pickup regions shaping this business’s live operations.';

  return (
    <div className="dashboard-layout__body">
        <aside className="dashboard-layout__sidebar" aria-label="Workspace navigation">
          <SidebarBrand />
          <div className="dashboard-sidebar__menu">
            <BusinessNavigation businessIdentifier={businessIdentifier} active="settings" />
          </div>
        </aside>

        <main className="dashboard-layout__main">
          <DashboardBusinessHeader />
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
              <div className="surface-card surface-card--muted">
                <div className="section-header">
                  <div>
                    <h2 className="section-title">Business overview</h2>
                    <p className="section-caption">Current state and identifiers powering live operations. Edit details in the profile below.</p>
                  </div>
                </div>

                {businessOverviewItems.length ? (
                  <div style={{ marginTop: '0.5rem', overflowX: 'auto' }}>
                    <table
                      style={{
                        width: '100%',
                        minWidth: '640px',
                        borderCollapse: 'separate',
                        borderSpacing: '0 0.25rem',
                        fontSize: '0.9rem',
                        lineHeight: 1.4,
                        textAlign: 'center',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      <thead>
                        <tr>
                          {businessOverviewItems.map((item) => (
                            <th
                              key={`${item.key}-header`}
                              style={{
                                padding: '0.35rem 0.5rem',
                                color: '#6b7280',
                                fontWeight: 600
                              }}
                              scope="col"
                            >
                              {item.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          {businessOverviewItems.map((item) => (
                            <td key={`${item.key}-value`} style={{ padding: '0.35rem 0.5rem', color: '#111827' }}>
                              {item.status ? (
                                <span className="status-pill" data-status={item.status}>
                                  {item.value}
                                </span>
                              ) : (
                                item.value
                              )}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No overview data available for this business yet.</p>
                )}
              </div>
            </section>

            <section className="section">
              <div className="section-header">
                <h2 className="section-title">Business profile</h2>
                <p className="section-caption">Review and adjust general details for this business.</p>
              </div>

              <div className="surface-card surface-card--muted">
                <BusinessForm mode="edit" businessId={business.id} initialValues={initialValues} showPlaceSearch={false} />
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

            <section className="section">
              <div className="section-header">
                <h2 className="section-title">User settings</h2>
                <p className="section-caption">Manage your sign-in details, synced with Firebase authentication.</p>
              </div>

              <div className="surface-card surface-card--muted">
                <UserAccountSettings initialEmail={session.email} />
              </div>
            </section>
          </div>
        </main>
      </div>
  );
}
