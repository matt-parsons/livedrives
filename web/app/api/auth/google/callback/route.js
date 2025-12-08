import { NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebaseAdmin';
import { bootstrapUser } from '@/lib/bootstrapUser';
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_MS } from '@/lib/authServer';

export const runtime = 'nodejs';

function parseRedirect(state) {
  if (!state) {
    return '/dashboard';
  }

  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
    if (typeof decoded?.redirect === 'string' && decoded.redirect.startsWith('/')) {
      return decoded.redirect;
    }
  } catch (error) {
    console.warn('Unable to parse Google login state', error);
  }

  return '/dashboard';
}

async function exchangeCodeForTokens({ code, clientId, clientSecret, redirectUri }) {
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    })
  });

  if (!tokenResponse.ok) {
    const payload = await tokenResponse.json().catch(() => ({}));
    const message = payload?.error_description || 'Google authorization failed.';
    throw new Error(message);
  }

  const tokens = await tokenResponse.json();
  if (!tokens.id_token) {
    throw new Error('Missing Google ID token.');
  }

  return tokens;
}

async function exchangeGoogleIdTokenForFirebase(idToken, firebaseApiKey, redirectUri) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${firebaseApiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        postBody: `id_token=${idToken}&providerId=google.com`,
        requestUri: redirectUri,
        returnSecureToken: true,
        returnIdpCredential: true
      })
    }
  );

  const payload = await response.json().catch(() => ({}));

  if (!response.ok || !payload.idToken) {
    const message = payload?.error?.message || 'Firebase sign-in with Google failed.';
    throw new Error(message);
  }

  return payload.idToken;
}

export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  const redirectPath = parseRedirect(state);
  const redirectUrl = new URL(redirectPath, url.origin);

  if (error) {
    console.error('Google returned an error during login', error);
    return NextResponse.redirect(redirectUrl);
  }

  if (!code) {
    console.error('Missing Google authorization code.');
    return NextResponse.redirect(redirectUrl);
  }

  const clientId = process.env.GOOGLE_LOGIN_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_LOGIE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_LOGIN_OAUTH_REDIRECT_URI;
  const firebaseApiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

  if (!clientId || !clientSecret || !redirectUri || !firebaseApiKey) {
    console.error('Google login configuration is incomplete.');
    return NextResponse.redirect(redirectUrl);
  }

  try {
    const tokens = await exchangeCodeForTokens({ code, clientId, clientSecret, redirectUri });
    const firebaseIdToken = await exchangeGoogleIdTokenForFirebase(
      tokens.id_token,
      firebaseApiKey,
      redirectUri
    );

    const decoded = await adminAuth.verifyIdToken(firebaseIdToken, true);
    await bootstrapUser(decoded);

    const sessionCookie = await adminAuth.createSessionCookie(firebaseIdToken, {
      expiresIn: SESSION_MAX_AGE_MS
    });

    const response = NextResponse.redirect(redirectUrl.toString());
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: sessionCookie,
      maxAge: SESSION_MAX_AGE_MS / 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/'
    });

    return response;
  } catch (authError) {
    console.error('Google OAuth callback failed', authError);
    return NextResponse.redirect(redirectUrl);
  }
}
