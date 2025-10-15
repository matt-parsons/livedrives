import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AuthError, requireAuth } from '@/lib/authServer';
import { loadBusiness } from '../helpers';
import BusinessForm from '../../businesses/BusinessForm';

export default async function EditBusinessPage({ params }) {
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

  const initialValues = {
    ...business,
    brandSearch: business.brandSearch ?? '',
    gPlaceId: business.gPlaceId ?? '',
    isActive: business.isActive === true || business.isActive === 1
  };

  const businessLabel = business.businessName || 'Business';
  const backHref = `/dashboard/${encodeURIComponent(identifier)}`;

  return (
    <div className="page-shell">
      <section className="page-header">
        <h1 className="page-title">Edit {businessLabel}</h1>
        <p className="page-subtitle">Update destination, identifiers, and activation to keep operations accurate.</p>
      </section>

      <section className="section">
        <div className="section-header">
          <h2 className="section-title">Business details</h2>
          <p className="section-caption">Review and adjust configuration for this business.</p>
        </div>

        <div className="surface-card surface-card--muted">
          <BusinessForm mode="edit" businessId={business.id} initialValues={initialValues} />
        </div>
      </section>

      <section className="section">
        <Link className="cta-link" href={backHref}>← Back to business</Link>
      </section>
    </div>
  );
}
