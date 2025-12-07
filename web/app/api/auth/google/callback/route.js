import { NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebaseAdmin';
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_MS } from '@/lib/authServer';

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const USERINFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v2/userinfo';

export const runtime = 'nodejs';

function getEnvOrThrow(key) {
  const value = process.env[key];
  if (value) return value;

  const fallback = process.env.GOOGLE_LOGIE_OAUTH_CLIENT_SECRET;
  if (key === 'GOOGLE_LOGIN_OAUTH_CLIENT_SECRET' && fallback) {
    return fallback;
  }

  throw new Error(`Missing ${key} environment variable`);
}

function parseState(value) {
  if (!value) {
    return { redirect: '/dashboard', errorRedirect: '/auth/signin' };
  }

  try {
    const decoded = Buffer.from(value, 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded);
    const redirect = typeof parsed.redirect === 'string' && parsed.redirect.startsWith('/')
      ? parsed.redirect
      : '/dashboard';
    const errorRedirect = typeof parsed.errorRedirect === 'string' && parsed.errorRedirect.startsWith('/')
      ? parsed.errorRedirect
      : '/auth/signin';

    return { redirect, errorRedirect };
  } catch (error) {
    console.warn('Failed to parse Google login state', error);
    return { redirect: '/dashboard', errorRedirect: '/auth/signin' };
  }
}

async function exchangeAuthorizationCode(code, redirectUri) {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: getEnvOrThrow('GOOGLE_LOGIN_OAUTH_CLIENT_ID'),
      client_secret: getEnvOrThrow('GOOGLE_LOGIN_OAUTH_CLIENT_SECRET'),
      grant_type: 'authorization_code',
      redirect_uri: redirectUri
    }).toString()
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error_description || 'Token exchange failed');
  }

  const payload = await response.json();
  if (!payload.access_token) {
    throw new Error('Missing access token in Google response');
  }

  return payload;
}

async function fetchGoogleProfile(accessToken) {
  const response = await fetch(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    throw new Error('Failed to load Google profile');
  }

  const profile = await response.json();
  if (!profile?.email) {
    throw new Error('Google profile is missing an email address');
  }

  return {
    email: profile.email.toLowerCase(),
    name: profile.name || '',
    avatar: profile.picture || null,
    subject: profile.id || null,
    emailVerified: Boolean(profile.verified_email)
  };
}

async function ensureFirebaseUser(profile) {
  const sanitizedDisplayName = profile.name ? profile.name.slice(0, 128) : undefined;

  try {
    const record = await adminAuth.getUserByEmail(profile.email);
    const updates = {};

    if (!record.emailVerified && profile.emailVerified) {
      updates.emailVerified = true;
    }

    if (sanitizedDisplayName && record.displayName !== sanitizedDisplayName) {
      updates.displayName = sanitizedDisplayName;
    }

    if (Object.keys(updates).length) {
      return adminAuth.updateUser(record.uid, updates);
    }

    return record;
  } catch (error) {
    if (error.code !== 'auth/user-not-found') {
      throw error;
    }

    return adminAuth.createUser({
      email: profile.email,
      displayName: sanitizedDisplayName,
      emailVerified: profile.emailVerified
    });
  }
}

async function createFirebaseSessionCookie(uid) {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) {
    throw new Error('Missing NEXT_PUBLIC_FIREBASE_API_KEY');
  }

  const customToken = await adminAuth.createCustomToken(uid);
  const idTokenResponse = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true })
    }
  );

  if (!idTokenResponse.ok) {
    const payload = await idTokenResponse.json().catch(() => ({}));
    throw new Error(payload.error?.message || 'Failed to exchange Firebase custom token');
  }

  const { idToken } = await idTokenResponse.json();
  if (!idToken) {
    throw new Error('Firebase did not return an ID token');
  }

  return adminAuth.createSessionCookie(idToken, { expiresIn: SESSION_MAX_AGE_MS });
}

async function bootstrapUserSession(requestUrl, sessionCookie) {
  const bootstrapUrl = new URL('/api/auth/bootstrap', new URL(requestUrl).origin);
  const response = await fetch(bootstrapUrl.toString(), {
    method: 'POST',
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${sessionCookie}`
    }
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || 'Failed to link Google account to your profile');
  }
}

export async function GET(request) {
  const url = new URL(request.url);
  const { redirect, errorRedirect: errorRedirectPath } = parseState(url.searchParams.get('state'));
  const fallbackRedirect = redirect || '/dashboard';
  const errorRedirect = new URL(errorRedirectPath || '/auth/signin', url.origin);
  errorRedirect.searchParams.set('error', 'google_login_failed');

  const code = url.searchParams.get('code');
  const oauthError = url.searchParams.get('error');

  if (oauthError || !code) {
    return NextResponse.redirect(errorRedirect);
  }

  try {
    const { access_token: accessToken } = await exchangeAuthorizationCode(
      code,
      getEnvOrThrow('GOOGLE_LOGIN_OAUTH_REDIRECT_URI')
    );
    const profile = await fetchGoogleProfile(accessToken);
    const firebaseUser = await ensureFirebaseUser(profile);
    const sessionCookie = await createFirebaseSessionCookie(firebaseUser.uid);

    await bootstrapUserSession(request.url, sessionCookie);

    const redirectUrl = new URL(fallbackRedirect, url.origin);
    const response = NextResponse.redirect(redirectUrl);
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
  } catch (error) {
    console.error('Google login failed', error);
    errorRedirect.searchParams.set('reason', 'server_error');
    return NextResponse.redirect(errorRedirect);
  }
}
