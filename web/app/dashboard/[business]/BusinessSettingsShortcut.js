import Link from 'next/link';
import { Settings } from 'lucide-react';

function encodeIdentifier(value) {
  if (!value) {
    return '';
  }

  return encodeURIComponent(String(value));
}

export default function BusinessSettingsShortcut({ businessIdentifier, ariaLabel = 'Business settings' }) {
  const identifier = encodeIdentifier(businessIdentifier);

  if (!identifier) {
    return null;
  }

  const href = `/dashboard/${identifier}/settings`;

  return (
    <Link className="dashboard-header__settings-link" href={href} aria-label={ariaLabel}>
      <Settings aria-hidden="true" />
    </Link>
  );
}
