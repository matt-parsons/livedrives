import crypto from 'node:crypto';

const GBP_SCOPES = ['https://www.googleapis.com/auth/business.manage'];
const GBP_REVIEW_ENDPOINT = 'https://mybusiness.googleapis.com/v4';

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
