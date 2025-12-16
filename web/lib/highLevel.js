import { HighLevel } from '@gohighlevel/api-client';

function splitName(fullName) {
  if (typeof fullName !== 'string') {
    return { firstName: undefined, lastName: undefined };
  }

  const trimmed = fullName.trim();
  if (!trimmed) {
    return { firstName: undefined, lastName: undefined };
  }

  const parts = trimmed.split(/\s+/);
  const firstName = parts.shift();
  const lastName = parts.length ? parts.join(' ') : undefined;

  return { firstName, lastName };
}

export function isHighLevelConfigured() {
  return Boolean(
    process.env.HIGH_LEVEL_CLIENT_ID &&
    process.env.HIGH_LEVEL_CLIENT_SECRET &&
    process.env.HIGH_LEVEL_LOCATION_ID
  );
}

let cachedHighLevelClient = null;

function getHighLevelClient() {
  if (cachedHighLevelClient) {
    return cachedHighLevelClient;
  }

  const clientId = process.env.HIGH_LEVEL_CLIENT_ID;
  const clientSecret = process.env.HIGH_LEVEL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('HighLevel client credentials are not configured');
  }

  cachedHighLevelClient = new HighLevel({ clientId, clientSecret });
  return cachedHighLevelClient;
}

export async function createHighLevelContact({
  email,
  name,
  locationId = process.env.HIGH_LEVEL_LOCATION_ID,
  tags = [],
  companyName,
  address1
}) {
  if (!email) {
    throw new Error('Email is required to create a HighLevel contact');
  }

  if (!locationId) {
    throw new Error('HighLevel locationId is not configured');
  }

  const { firstName, lastName } = splitName(name);
  const payload = {
    email,
    name: name || undefined,
    firstName,
    lastName,
    locationId,
    tags: Array.from(new Set([...(tags || []), 'account_trial'].filter(Boolean)))
  };

  if (companyName) {
    payload.companyName = companyName;
  }

  if (address1) {
    payload.address1 = address1;
  }

  const client = getHighLevelClient();
  const response = await client.contacts.createContact(payload);

  return response?.data ?? response;
}
