import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/authServer';
import { loadAllOrganizationDirectories } from '@/app/dashboard/operations/users/helpers';

export async function GET(request, { params }) {
  try {
    const session = await requireAuth();
    const { organizationId: requestedOrganizationId } = params;

    if (!requestedOrganizationId) {
      return NextResponse.json({ error: 'Organization ID is required' }, { status: 400 });
    }

    const organizations = await loadAllOrganizationDirectories();

    const currentOrganization = organizations.find(
      (org) => String(org.organizationId) === String(requestedOrganizationId)
    );

    if (!currentOrganization) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    // Ensure the authenticated user has access to this organization
    if (String(session.organizationId) !== String(currentOrganization.organizationId)) {
      return NextResponse.json({ error: 'Unauthorized access to organization' }, { status: 403 });
    }

    return NextResponse.json({
      subscription: currentOrganization.subscription,
      trial: currentOrganization.trial,
    });
  } catch (error) {
    if (error.name === 'AuthError') {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('API Error fetching organization data:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
