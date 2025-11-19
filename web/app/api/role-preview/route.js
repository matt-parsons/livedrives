import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { AuthError, requireAuth } from '@/lib/authServer';
import {
  ROLE_PREVIEW_COOKIE_NAME,
  isRolePreviewSupported
} from '@/lib/rolePreview';

function jsonError(message, status) {
  return NextResponse.json({ error: message }, { status });
}

function handleAuthFailure(error) {
  if (error instanceof AuthError && error.statusCode >= 400 && error.statusCode < 500) {
    return jsonError(error.message, error.statusCode);
  }

  throw error;
}

export async function POST(request) {
  let session;

  try {
    session = await requireAuth(request);
  } catch (error) {
    return handleAuthFailure(error);
  }

  if (session.actualRole !== 'admin') {
    return jsonError('Forbidden', 403);
  }

  let payload;

  try {
    payload = await request.json();
  } catch (error) {
    return jsonError('Invalid request body', 400);
  }

  const { role } = payload ?? {};

  if (!isRolePreviewSupported(role)) {
    return jsonError('Unsupported preview role', 400);
  }

  cookies().set(ROLE_PREVIEW_COOKIE_NAME, role, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 // 1 hour
  });

  return NextResponse.json({ ok: true, role });
}

export async function DELETE(request) {
  let session;

  try {
    session = await requireAuth(request);
  } catch (error) {
    return handleAuthFailure(error);
  }

  if (session.actualRole !== 'admin') {
    return jsonError('Forbidden', 403);
  }

  cookies().delete(ROLE_PREVIEW_COOKIE_NAME);

  return NextResponse.json({ ok: true });
}
