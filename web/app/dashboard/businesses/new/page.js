import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthError, requireAuth } from '@/lib/authServer';
import BusinessForm from '../BusinessForm';
import OperationsNavigation from '../../operations/OperationsNavigation';
import SidebarBrand from '../../[business]/SidebarBrand';

export default async function NewBusinessPage() {
  try {
    await requireAuth();
  } catch (error) {
    if (error instanceof AuthError && error.statusCode >= 400 && error.statusCode < 500) {
      redirect('/signin');
    }

    throw error;
  }

  return (
    <div className="dashboard-layout__body">
      <aside className="dashboard-layout__sidebar" aria-label="Operations navigation">
        <SidebarBrand />
        <div className="dashboard-sidebar__menu">
          <OperationsNavigation />
        </div>
      </aside>
      <div className="dashboard-layout__main">
        <header className="dashboard-layout__header">
          <div className="dashboard-layout__header-container">
            <div className="dashboard-header">
              <div className="dashboard-header__content">
                <h1 className="page-title">Create a business</h1>
                <span className="dashboard-sidebar__location">Search for a business profile to automatically collect the details you need.</span>
              </div>
            </div>
          </div>
        </header>
        <div className="dashboard-layout__content">
          <section className="section">
            <div className="section-header">
              <h2 className="section-title">Business profile</h2>
              <p className="section-caption">Fill in as much as you know now; you can refine the record anytime.</p>
            </div>

            <div className="surface-card surface-card--muted">
              <BusinessForm mode="create" searchOnly />
            </div>
          </section>

          <section className="section">
            <Link className="cta-link" href="/dashboard">← Back to dashboard</Link>
          </section>
        </div>
      </div>
    </div>
  );
}
