import crypto from 'node:crypto';
import { loadGbpAuthorization, upsertGbpAuthorization } from '@lib/gbpAuthorizations.js';

const GBP_SCOPES = ['https://www.googleapis.com/auth/business.manage'];
const GBP_REVIEW_ENDPOINT = 'https://businessprofileperformance.googleapis.com/v1';
const GBP_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const TOKEN_REFRESH_BUFFER_MS = 60 * 1000;

function resolveOauthConfig() {
  const clientId = process.env.GOOGLE_BUSINESS_PROFILE_OAUTH_CLIENT_ID ?? '';
  const clientSecret = process.env.GOOGLE_BUSINESS_PROFILE_OAUTH_CLIENT_SECRET ?? '';
  const redirectUri = process.env.GOOGLE_BUSINESS_PROFILE_OAUTH_REDIRECT_URI ?? '';

  if (!clientId || !clientSecret || !redirectUri) {
    return null;
  }

  return { clientId, clientSecret, redirectUri };
}

export function buildGbpAuthUrl({ redirectUri, state } = {}) {
  const clientId = process.env.GOOGLE_BUSINESS_PROFILE_OAUTH_CLIENT_ID;
  const redirect = redirectUri ?? process.env.GOOGLE_BUSINESS_PROFILE_OAUTH_REDIRECT_URI;

  if (!clientId || !redirect) {
    return null;
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirect,
    response_type: 'code',
    scope: GBP_SCOPES.join(' '),
    access_type: 'offline',
    include_granted_scopes: 'true',
    state: state || crypto.randomBytes(12).toString('hex')
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

async function requestGbpToken(body) {
  const payload = await fetch(GBP_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams(body)
  })
    .then(async (response) => {
      const json = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message = json.error_description ?? json.error ?? 'Unable to exchange Google tokens';
        throw new Error(message);
      }

      return json;
    });

  return payload;
}

async function persistTokenPayload(businessId, payload, fallbackRefreshToken) {
  if (!businessId) {
    throw new Error('Missing business identifier for GBP token persistence');
  }

  const accessToken = payload.access_token;
  if (!accessToken) {
    throw new Error('Google Business Profile token response did not include an access token');
  }

  const refreshToken = payload.refresh_token || fallbackRefreshToken;

  if (!refreshToken) {
    throw new Error('Google Business Profile token response did not include a refresh token');
  }

  const expiresIn = Number(payload.expires_in ?? payload.expiresIn ?? 0);
  const expiresAt =
    Number.isFinite(expiresIn) && expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000) : null;

  await upsertGbpAuthorization({
    businessId,
    refreshToken,
    accessToken,
    accessTokenExpiresAt: expiresAt,
    lastAuthorizedAt: new Date()
  });

  return { accessToken, refreshToken, expiresAt };
}

async function refreshAccessToken(record) {
  const credentials = resolveOauthConfig();
  if (!credentials) {
    throw new Error('Google Business Profile OAuth is not configured');
  }

  const payload = await requestGbpToken({
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    grant_type: 'refresh_token',
    refresh_token: record.refreshToken
  });

  return persistTokenPayload(record.businessId, payload, record.refreshToken);
}

export async function ensureGbpAccessToken(businessId) {
  if (!businessId) {
    return null;
  }

  const credentials = resolveOauthConfig();
  if (!credentials) {
    return null;
  }

  const record = await loadGbpAuthorization(businessId);
  if (!record?.refreshToken) {
    return null;
  }

  const expiresAt = record?.accessTokenExpiresAt
    ? new Date(record.accessTokenExpiresAt).getTime()
    : 0;

  if (record.accessToken && expiresAt - Date.now() > TOKEN_REFRESH_BUFFER_MS) {
    return record.accessToken;
  }

  try {
    return (await refreshAccessToken(record)).accessToken;
  } catch (error) {
    console.error('Failed to refresh GBP access token', error);
    return null;
  }
}

export async function exchangeGbpAuthorizationCode(businessId, code) {
  if (!businessId) {
    throw new Error('Missing business identifier for GBP authorization');
  }

  if (!code) {
    throw new Error('Missing authorization code for Google Business Profile');
  }

  const credentials = resolveOauthConfig();
  if (!credentials) {
    throw new Error('Google Business Profile OAuth is not configured');
  }

  const payload = await requestGbpToken({
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    redirect_uri: credentials.redirectUri,
    code,
    grant_type: 'authorization_code'
  });

  return persistTokenPayload(businessId, payload);
}

export async function fetchGbpReviews(accessToken, locationName) {
  if (!accessToken) {
    throw new Error('Missing Google Business Profile access token');
  }

  if (!locationName) {
    throw new Error('Missing Google Business Profile location identifier');
  }

  const response = await fetch(
    `${GBP_REVIEW_ENDPOINT}/${locationName.replace(/^\//, '')}/reviews?orderBy=updateTime desc&pageSize=100`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      next: { revalidate: 300 }
    }
  );

  if (!response.ok) {
    throw new Error(`GBP review request failed (${response.status})`);
  }

  const payload = await response.json();
  return Array.isArray(payload.reviews) ? payload.reviews : [];
}

export function deriveLocationName(business) {
  if (!business) {
    return null;
  }

  if (business.mid) {
    return `locations/${business.mid}`;
  }

  if (business.gPlaceId) {
    return `locations/${business.gPlaceId}`;
  }

  return null;
}
