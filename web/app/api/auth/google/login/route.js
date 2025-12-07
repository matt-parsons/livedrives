import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

function getEnvOrThrow(key) {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing ${key} environment variable`);
  }
  return value;
}

function encodeState(state) {
  return Buffer.from(JSON.stringify(state), 'utf8').toString('base64url');
}

function normalizeRedirectPath(value) {
  if (typeof value !== 'string') {
    return '/dashboard';
  }

  if (!value.startsWith('/')) {
    return '/dashboard';
  }

  return value || '/dashboard';
}

export async function GET(request) {
  try {
    const clientId = getEnvOrThrow('GOOGLE_LOGIN_OAUTH_CLIENT_ID');
    const redirectUri = getEnvOrThrow('GOOGLE_LOGIN_OAUTH_REDIRECT_URI');
    const params = new URL(request.url).searchParams;
    const redirectPath = normalizeRedirectPath(params.get('redirect'));
    const state = encodeState({ redirect: redirectPath });

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'openid email profile');
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'select_account');
    authUrl.searchParams.set('state', state);

    return NextResponse.redirect(authUrl.toString());
  } catch (error) {
    console.error('Failed to start Google login', error);
    return NextResponse.json({ error: 'Google login is not available right now.' }, { status: 500 });
  }
}
