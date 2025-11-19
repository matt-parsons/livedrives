import Link from 'next/link';
import BrandIdentity from '@/app/components/BrandIdentity';

export default function SidebarBrand() {
  return (
    <div className="dashboard-sidebar__brand">
      <Link className="app-brand" href="/dashboard">
        <BrandIdentity />
      </Link>
    </div>
  );
}
