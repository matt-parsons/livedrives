import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card, CardBody, CardFooter, CardHeader, Chip, Divider, Button } from '@heroui/react';
import { AuthError, requireAuth } from '@/lib/authServer';
import { loadOrganizationBusinesses } from './[business]/helpers.js';

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

  const businesses = await loadOrganizationBusinesses(session.organizationId);

  if (!businesses.length) {
    const isOwner = session.role === 'owner';

    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
        <Card className="bg-content1/90 shadow-large backdrop-blur-lg">
          <CardHeader className="flex flex-col items-start gap-2">
            <Chip color="secondary" variant="flat" className="font-semibold uppercase tracking-wide">
              Getting started
            </Chip>
            <div>
              <h1 className="text-3xl font-semibold text-foreground">Launch your first business</h1>
              <p className="mt-1 text-base text-foreground/70">
                Create a business profile to unlock scheduling automations, geo grid insights, and live operations
                monitoring.
              </p>
            </div>
          </CardHeader>
          <Divider className="mx-6" />
          <CardBody className="space-y-4 text-foreground/70">
            <p>
              Businesses power every dashboard inside LiveDrives. Once the first business is created, we’ll connect
              run history, keyword coverage, and optimization insights automatically.
            </p>
            <ul className="list-disc space-y-2 pl-5 text-sm">
              <li>Invite dispatchers and operators as soon as a business profile is active.</li>
              <li>Schedule geo grid runs to baseline local rankings and track improvements.</li>
              <li>Define origin zones to balance pickup routing and launch more efficient campaigns.</li>
            </ul>
          </CardBody>
          <CardFooter className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            {isOwner ? (
              <Button as={Link} color="primary" href="/dashboard/businesses/new" size="lg">
                Create business
              </Button>
            ) : (
              <p className="text-sm text-foreground/60">
                Reach out to an owner or admin so they can create and assign a business to you.
              </p>
            )}
            <div className="flex flex-wrap gap-2 text-xs text-foreground/50">
              <Chip variant="bordered" color="secondary">
                Ops automation ready
              </Chip>
              <Chip variant="bordered" color="secondary">
                Geo coverage tracking
              </Chip>
              <Chip variant="bordered" color="secondary">
                Optimization roadmap
              </Chip>
            </div>
          </CardFooter>
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
