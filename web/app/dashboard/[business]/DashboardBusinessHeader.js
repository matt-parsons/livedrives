'use client';

import BusinessSettingsShortcut from './BusinessSettingsShortcut';
import BusinessSwitcher from './BusinessSwitcher';
import { useBusinessLayout } from './BusinessLayoutContext';
import TrialBanner from '@/app/components/TrialBanner';

export default function DashboardBusinessHeader({ organizationId }) {
  const {
    businessName,
    locationLabel,
    canManageSettings,
    showBusinessSwitcher,
    businessIdentifier,
    businessOptions,
    currentBusinessOptionValue
  } = useBusinessLayout();

  return (
    <header className="dashboard-layout__header">
      <TrialBanner organizationId={organizationId} />

      <div className="dashboard-layout__header-container">
        <div className="dashboard-header">
          <div className="dashboard-header__content">
            <h1 className="page-title">{businessName}</h1>
            {locationLabel ? <span className="dashboard-sidebar__location">{locationLabel}</span> : null}
          </div>
        </div>

        {canManageSettings || showBusinessSwitcher ? (
          <div className="dashboard-header__actions" aria-label="Business shortcuts">
            {showBusinessSwitcher ? (
              <BusinessSwitcher businesses={businessOptions} currentValue={currentBusinessOptionValue} />
            ) : null}
          </div>
        ) : null}
      </div>
    </header>
  );
}
