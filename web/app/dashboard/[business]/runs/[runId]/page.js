import { notFound, redirect } from 'next/navigation';
import { AuthError, requireAuth } from '@/lib/authServer';
import { loadBusiness } from '../../helpers';

export default async function GeoGridRunRedirect({ params, searchParams }) {
  const identifier = params.business;
  const runId = params.runId;

  let session;

  try {
    session = await requireAuth();
  } catch (error) {
    if (error instanceof AuthError && error.statusCode >= 400 && error.statusCode < 500) {
      redirect('/signin');
    }

    throw error;
  }

  const business = await loadBusiness(session, identifier);

  if (!business) {
    notFound();
  }

  const paramsOut = new URLSearchParams(searchParams ?? {});
  paramsOut.set('bId', String(business.id));

  redirect(`/dashboard/runs/${encodeURIComponent(runId)}?${paramsOut.toString()}`);
}
