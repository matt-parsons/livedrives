import { AuthError, requireAuth } from '@/lib/authServer';
import {
  loadBusiness,
  loadGeoGridRunWithPoints
} from '@/app/dashboard/[business]/helpers.js';
import { buildPointListingIndex } from '@/app/dashboard/[business]/runs/listings.js';

export const runtime = 'nodejs';

export async function GET(request, { params }) {
  const rawBusinessId = params?.businessId;
  const rawRunId = params?.runId;

  const businessId = Number(rawBusinessId);
  const runId = Number(rawRunId);

  if (!Number.isFinite(businessId) || businessId <= 0) {
    return Response.json({ error: 'Invalid business identifier.' }, { status: 400 });
  }

  if (!Number.isFinite(runId) || runId <= 0) {
    return Response.json({ error: 'Invalid run identifier.' }, { status: 400 });
  }

  try {
    const session = await requireAuth(request);
    const business = await loadBusiness(session.organizationId, String(businessId));

    if (!business) {
      return Response.json({ error: 'Business not found.' }, { status: 404 });
    }

    const runData = await loadGeoGridRunWithPoints(business.id, runId);

    if (!runData) {
      return Response.json({ error: 'Run not found.' }, { status: 404 });
    }

    const { run, points } = runData;
    const pointListings = buildPointListingIndex(points, {
      businessName: business.businessName,
      businessPlaceId: business.gPlaceId
    });
    const sanitizedPoints = points.map((point) => ({
      id: point.id,
      rowIndex: point.rowIndex,
      colIndex: point.colIndex,
      lat: point.lat,
      lng: point.lng,
      rankPosition: point.rankPosition,
      measuredAt: point.measuredAt
    }));

    return Response.json({ run, points: sanitizedPoints, pointListings });
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }

    console.error(
      `Failed to load geo grid run ${runId} for business ${businessId}`,
      error
    );
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

