import { NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebaseAdmin';
import { bootstrapUser } from '@/lib/bootstrapUser';
import { applySessionCookie, SESSION_MAX_AGE_MS } from '@/lib/authServer';
import { trackUserLogin } from '@/lib/loginTracking';

const GOOGLE_LOGIN_ID_KEYS = [
  'GOOGLE_LOGIN_OAUTH_CLIENT_ID',
  'GOOGLE_OAUTH_CLIENT_ID',
  'NEXT_PUBLIC_GOOGLE_LOGIN_OAUTH_CLIENT_ID',
  'NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID'
];

const GOOGLE_LOGIN_SECRET_KEYS = [
  'GOOGLE_LOGIN_OAUTH_CLIENT_SECRET',
  'GOOGLE_OAUTH_CLIENT_SECRET'
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
  const clientSecret = resolveEnv(GOOGLE_LOGIN_SECRET_KEYS);
  const envRedirectUri = resolveEnv(GOOGLE_LOGIN_REDIRECT_KEYS);
  const redirectUri = envRedirectUri || new URL('/api/auth/google/callback', origin).toString();

  return {
    clientId,
    clientSecret,
    redirectUri,
    firebaseApiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
    appPublicUrl: process.env.APP_PUBLIC_URL,
    requestOrigin: origin
  };
}

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

async function exchangeGoogleIdTokenForFirebase(idToken, firebaseApiKey, requestUri) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${firebaseApiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        postBody: `id_token=${idToken}&providerId=google.com`,
        requestUri,
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

function resolveRedirectOrigin({ appPublicUrl, redirectUri, requestOrigin }) {
  const productionOrigin = process.env.APP_PRODUCTION_URL || 'https://app.localpaintpilot.com';

  const candidates = [
    process.env.NODE_ENV === 'production' ? productionOrigin : null,
    appPublicUrl,
    redirectUri
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      return new URL(candidate).origin;
    } catch (error) {
      console.warn('Invalid redirect origin candidate', candidate, error);
    }
  }

  return requestOrigin;
}

export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  const redirectPath = parseRedirect(state);
  const { clientId, clientSecret, redirectUri, firebaseApiKey, appPublicUrl, requestOrigin } =
    getGoogleLoginConfig(request);

  const redirectBase = resolveRedirectOrigin({
    appPublicUrl,
    redirectUri,
    requestOrigin
  });
  const redirectUrl = new URL(redirectPath, redirectBase);
  const firebaseRequestUri = new URL('/', redirectBase).toString();

  if (error) {
    console.error('Google returned an error during login', error);
    return NextResponse.redirect(redirectUrl);
  }

  if (!code) {
    console.error('Missing Google authorization code.');
    return NextResponse.redirect(redirectUrl);
  }

  const missingFields = [];

  if (!clientId) {
    missingFields.push(`one of: ${GOOGLE_LOGIN_ID_KEYS.join(' or ')}`);
  }

  if (!clientSecret) {
    missingFields.push(`one of: ${GOOGLE_LOGIN_SECRET_KEYS.join(' or ')}`);
  }

  if (!firebaseApiKey) {
    missingFields.push('NEXT_PUBLIC_FIREBASE_API_KEY');
  }

  if (missingFields.length) {
    console.error('Google login configuration is incomplete.', { missingFields, redirectUri });
    return NextResponse.redirect(redirectUrl);
  }

  try {
    const tokens = await exchangeCodeForTokens({ code, clientId, clientSecret, redirectUri });
    const firebaseIdToken = await exchangeGoogleIdTokenForFirebase(
      tokens.id_token,
      firebaseApiKey,
      firebaseRequestUri
    );

    const decoded = await adminAuth.verifyIdToken(firebaseIdToken, true);
    await bootstrapUser(decoded);

    const sessionCookie = await adminAuth.createSessionCookie(firebaseIdToken, {
      expiresIn: SESSION_MAX_AGE_MS
    });

    try {
      await trackUserLogin({ firebaseUid: decoded.uid });
    } catch (error) {
      console.error('Failed to track login activity', error);
    }

    return applySessionCookie(NextResponse.redirect(redirectUrl.toString()), sessionCookie, {
      hostname: request?.nextUrl?.hostname ?? new URL(request.url).hostname,
      maxAgeMs: SESSION_MAX_AGE_MS
    });
  } catch (authError) {
    console.error('Google OAuth callback failed', authError);
    return NextResponse.redirect(redirectUrl);
  }
}
