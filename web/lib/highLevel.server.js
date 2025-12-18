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
    process.env.HIGH_LEVEL_ACCESS_TOKEN &&
    process.env.HIGH_LEVEL_LOCATION_ID
  );
}

let cachedHighLevelClient = null;

function getHighLevelClient() {
  if (cachedHighLevelClient) {
    return cachedHighLevelClient;
  }

  // const clientId = process.env.HIGH_LEVEL_CLIENT_ID;
  // const clientSecret = process.env.HIGH_LEVEL_CLIENT_SECRET;
  const accessToken = process.env.HIGH_LEVEL_ACCESS_TOKEN;

  // if (!clientId || !clientSecret) {
  //   throw new Error('HighLevel client credentials are not configured');
  // }
  if (!accessToken) {
    throw new Error('HighLevel client credentials are not configured');
  }

  cachedHighLevelClient = new HighLevel({ privateIntegrationToken: accessToken });
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
    tags: Array.from(new Set([...(tags || [])].filter(Boolean)))
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

function normalizeOptionalString(value) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

export async function upsertHighLevelContact({
  email,
  name,
  locationId = process.env.HIGH_LEVEL_LOCATION_ID,
  tags = [],
  companyName,
  address1,
  phone,
  website,
  postalCode,
  city,
  state,
  timezone
}) {
  if (!email) {
    throw new Error('Email is required to upsert a HighLevel contact');
  }

  if (!locationId) {
    throw new Error('HighLevel locationId is not configured');
  }

  const { firstName, lastName } = splitName(name);
  const payload = {
    email,
    name: normalizeOptionalString(name),
    firstName,
    lastName,
    locationId
  };

  const normalizedTags = Array.from(new Set([...(tags || [])].filter(Boolean)));
  if (normalizedTags.length) {
    payload.tags = normalizedTags;
  }

  const normalizedCompany = normalizeOptionalString(companyName);
  if (normalizedCompany) {
    payload.companyName = normalizedCompany;
  }

  const normalizedAddress = normalizeOptionalString(address1);
  if (normalizedAddress) {
    payload.address1 = normalizedAddress;
  }

  const normalizedPhone = normalizeOptionalString(phone);
  if (normalizedPhone) {
    payload.phone = normalizedPhone;
  }

  const normalizedWebsite = normalizeOptionalString(website);
  if (normalizedWebsite) {
    payload.website = normalizedWebsite;
  }

  const normalizedPostalCode = normalizeOptionalString(postalCode);
  if (normalizedPostalCode) {
    payload.postalCode = normalizedPostalCode;
  }

  const normalizedCity = normalizeOptionalString(city);
  if (normalizedCity) {
    payload.city = normalizedCity;
  }

  const normalizedState = normalizeOptionalString(state);
  if (normalizedState) {
    payload.state = normalizedState;
  }

  const normalizedTimezone = normalizeOptionalString(timezone);
  if (normalizedTimezone) {
    payload.timezone = normalizedTimezone;
  }

  const client = getHighLevelClient();
  const response = await client.contacts.upsertContact(payload);

  return response?.data ?? response;
}
