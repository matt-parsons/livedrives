import { AuthError, requireAuth } from '@/lib/authServer';
import { loadBusiness, loadGeoGridRunSummaries } from '@/app/dashboard/[business]/helpers';

export const runtime = 'nodejs';

// This is a placeholder for a function that would use a large language model
// to generate an overview of the ranking data.
async function generateRankingOverview(rankingData) {
  // In a real implementation, this would make a call to an LLM.
  // For now, it returns a dummy overview.
  return new Promise((resolve) => {
    setTimeout(() => {
      const overview = `This is a dummy AI overview of your ranking data. You have ${rankingData.length} ranking reports.`;
      resolve(overview);
    }, 1000);
  });
}

export async function GET(request, { params }) {
  const businessId = Number(params?.businessId);

  if (!Number.isFinite(businessId) || businessId <= 0) {
    return Response.json({ error: 'Invalid business identifier.' }, { status: 400 });
  }

  try {
    const session = await requireAuth(request);
    const business = await loadBusiness(session, businessId);

    if (!business) {
      return Response.json({ error: 'Business not found.' }, { status: 404 });
    }

    const rankingData = await loadGeoGridRunSummaries(business.id);
    const overview = await generateRankingOverview(rankingData);

    return Response.json({ overview });
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }

    console.error(`Failed to fetch ranking overview for business ${params?.businessId}`, error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
