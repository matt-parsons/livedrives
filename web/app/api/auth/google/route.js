import { NextResponse } from 'next/server';

const GOOGLE_LOGIN_ID_KEYS = [
  'GOOGLE_LOGIN_OAUTH_CLIENT_ID',
  'GOOGLE_OAUTH_CLIENT_ID',
  'NEXT_PUBLIC_GOOGLE_LOGIN_OAUTH_CLIENT_ID',
  'NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID'
];

const GOOGLE_LOGIN_REDIRECT_KEYS = [
  'GOOGLE_LOGIN_OAUTH_REDIRECT_URI',
  'GOOGLE_OAUTH_REDIRECT_URI'
];

function resolveEnv(keys) {
  for (const key of keys) {
    const value = process.env[key];
    if (value) return value;
  }

  return '';
}

function getGoogleLoginConfig(request) {
  const { origin } = new URL(request.url);
  const clientId = resolveEnv(GOOGLE_LOGIN_ID_KEYS);
  const redirectUri = resolveEnv(GOOGLE_LOGIN_REDIRECT_KEYS)
    || new URL('/api/auth/google/callback', origin).toString();

  return { clientId, redirectUri };
}

function buildStateParam(redirect) {
  const safeRedirect = typeof redirect === 'string' && redirect.startsWith('/') ? redirect : '/dashboard';
  const payload = { redirect: safeRedirect };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

export async function GET(request) {
  const { clientId, redirectUri } = getGoogleLoginConfig(request);

  if (!clientId || !redirectUri) {
    return NextResponse.json({ error: 'Google login is not configured.' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const redirect = searchParams.get('redirect') ?? '/dashboard';
  const state = buildStateParam(redirect);

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid email profile');
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'select_account');
  authUrl.searchParams.set('state', state);

  return NextResponse.redirect(authUrl.toString());
}
