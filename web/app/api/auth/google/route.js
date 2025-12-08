import { NextResponse } from 'next/server';

function buildStateParam(redirect) {
  const safeRedirect = typeof redirect === 'string' && redirect.startsWith('/') ? redirect : '/dashboard';
  const payload = { redirect: safeRedirect };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

export async function GET(request) {
  const clientId = process.env.GOOGLE_LOGIN_OAUTH_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_LOGIN_OAUTH_REDIRECT_URI;

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
