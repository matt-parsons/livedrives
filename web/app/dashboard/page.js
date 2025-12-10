import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthError, requireAuth } from '@/lib/authServer';
import { loadOrganizationBusinesses } from './[business]/helpers.js';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

function selectDefaultBusiness(session, businesses) {
  if (!Array.isArray(businesses) || businesses.length === 0) {
    return null;
  }

  const defaultBusinessId = session?.defaultBusinessId;
  const numericDefaultId = defaultBusinessId != null ? Number(defaultBusinessId) : null;

  if (Number.isFinite(numericDefaultId)) {
    const match = businesses.find((business) => Number(business.id) === numericDefaultId);

    if (match) {
      return match;
    }
  }

  const firstActive = businesses.find((business) => business.isActive);

  return firstActive ?? businesses[0] ?? null;
}

export default async function DashboardPage() {
  let session;

  try {
    session = await requireAuth();
  } catch (error) {
    if (error instanceof AuthError && error.statusCode >= 400 && error.statusCode < 500) {
      redirect('/signin');
    }

    throw error;
  }

  const businesses = await loadOrganizationBusinesses(session);

  if (!businesses.length) {

    return (
      <div className="page-shell">
        <section className="page-header">
          <h1 className="page-title">Add your business</h1>
          <p className="page-subtitle">
            Add your business profile to unlock optimization, profile ranking insights, and get more customers.
          </p>
        </section>

        <Card role="status" className="max-w-2xl border-dashed border-border/70 bg-card/90 shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl">You're almost ready</CardTitle>
            <CardDescription>
              There are no businesses linked to your organization yet.
            </CardDescription>
          </CardHeader>
          <div className="flex flex-col mt-5">
            <div className="flex flex-wrap">
              <Button asChild variant="outline">
                <Link href="/dashboard/get-started">Get Started!</Link>
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const defaultBusiness = selectDefaultBusiness(session, businesses);

  if (!defaultBusiness) {
    return null;
  }

  const identifier = defaultBusiness.businessSlug ?? String(defaultBusiness.id);
  const target = `/dashboard/${encodeURIComponent(identifier)}`;

  redirect(target);
}
