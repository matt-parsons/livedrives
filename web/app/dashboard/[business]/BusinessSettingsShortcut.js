import Link from 'next/link';
import { Settings } from 'lucide-react';

function encodeIdentifier(value) {
  if (!value) {
    return '';
  }

  return encodeURIComponent(String(value));
}

export default function BusinessSettingsShortcut({
  businessIdentifier,
  businessId,
  ariaLabel = 'Business settings'
}) {
  const identifier = encodeIdentifier(businessIdentifier);
  const idValue = businessId ? encodeURIComponent(String(businessId)) : '';

  if (!identifier && !idValue) {
    return null;
  }

  const href = idValue
    ? `/dashboard/settings?bId=${idValue}`
    : `/dashboard/${identifier}/settings`;

  return (
    <Link className="dashboard-header__settings-link" href={href} aria-label={ariaLabel}>
      <Settings aria-hidden="true" />
    </Link>
  );
}
