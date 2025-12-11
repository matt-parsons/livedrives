import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/authServer';
import BusinessForm from '../../businesses/BusinessForm';
import { loadOptimizationData } from '@/lib/optimizationData';

export const metadata = {
  title: 'Confirm Business · Local Paint Pilot'
};

function deriveInitialValues(place) {
    if (!place) return {};

    const location = place.location ?? {};
    const latValue = location.lat ?? null;
    const lngValue = location.lng ?? null;
    const timezone = place.timezone || 'America/Phoenix';

    return {
        businessName: place.name ?? '',
        businessSlug: '',
        brandSearch: place.name ?? '',
        destinationAddress: place.formattedAddress ?? '',
        destinationZip: place.postalCode ?? '',
        destLat: latValue ? String(latValue) : '',
        destLng: lngValue ? String(lngValue) : '',
        timezone: timezone,
        gPlaceId: place.placeId ?? '',
        mid: place.cid ? String(place.cid) : '',
        drivesPerDay: 5,
        isActive: true,
    };
}

export default async function ConfirmBusinessPage({ searchParams }) {
  const { placeId } = searchParams;

  if (!placeId) {
    redirect('/dashboard/get-started');
  }

  await requireAuth();

  let place;
  try {
    const { place: placeData } = await loadOptimizationData(placeId, { forceRefresh: true });
    place = placeData;
  } catch (error) {
    console.error('Failed to load optimization data for confirmation:', error);
    redirect('/dashboard/get-started?error=place_not_found');
  }

  if (!place) {
    redirect('/dashboard/get-started?error=place_not_found');
  }

  const initialValues = deriveInitialValues(place);

  return (
    <div className="page-shell">
      <section className="page-header">
        <h1 className="page-title">Confirm Your Business</h1>
        <p className="page-subtitle">
          We've filled in the details from Google. Please review and confirm them.
        </p>
      </section>

      <section className="section">
        <div className="rounded-2xl border border-border/60 bg-card/90 p-6 shadow-sm backdrop-blur">
          <BusinessForm
            mode="create"
            initialValues={initialValues}
            showPlaceSearch={false}
            redirectPath="/dashboard/get-started"
          />
        </div>
      </section>
    </div>
  );
}
