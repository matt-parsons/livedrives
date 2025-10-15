const FIELD_MAP = {
  businessName: 'business_name',
  businessSlug: 'business_slug',
  brandSearch: 'brand_search',
  mid: 'mid',
  destinationAddress: 'destination_address',
  destinationZip: 'destination_zip',
  destLat: 'dest_lat',
  destLng: 'dest_lng',
  timezone: 'timezone',
  drivesPerDay: 'drives_per_day',
  isActive: 'is_active',
  gPlaceId: 'g_place_id'
};

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function toNullableString(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const str = String(value).trim();
  return str.length ? str : null;
}

function toRequiredString(value) {
  const str = toNullableString(value);
  return str && str.length ? str : null;
}

function toSlug(value) {
  const str = toNullableString(value);
  if (!str) {
    return null;
  }

  const slug = str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);

  return slug.length ? slug : null;
}

function toNullableInt(value, { min = null, max = null } = {}) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const number = Number(value);
  if (!Number.isFinite(number)) {
    return undefined;
  }

  const intValue = Math.trunc(number);
  if (Math.abs(number - intValue) > 1e-9) {
    return undefined;
  }

  if (min !== null && intValue < min) {
    return undefined;
  }

  if (max !== null && intValue > max) {
    return undefined;
  }

  return intValue;
}

function toNullableFloat(value, { min = null, max = null } = {}) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const number = Number(value);
  if (!Number.isFinite(number)) {
    return undefined;
  }

  if (min !== null && number < min) {
    return undefined;
  }

  if (max !== null && number > max) {
    return undefined;
  }

  return number;
}

function toBooleanFlag(value) {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }

  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }

  if (typeof value === 'number') {
    return value === 0 ? 0 : 1;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized.length) {
      return undefined;
    }

    if (['true', '1', 'yes', 'y', 'on', 'active'].includes(normalized)) {
      return 1;
    }

    if (['false', '0', 'no', 'n', 'off', 'inactive'].includes(normalized)) {
      return 0;
    }
  }

  return undefined;
}

export function normalizeBusinessPayload(input, { partial = false } = {}) {
  if (!input || typeof input !== 'object') {
    return { errors: ['Request body must be a JSON object.'], values: {} };
  }

  const errors = [];
  const values = {};

  const requireName = !partial || hasOwn(input, 'businessName');
  if (requireName) {
    const name = toRequiredString(input.businessName);
    if (!name) {
      errors.push('businessName is required.');
    } else {
      values.businessName = name;
    }
  }

  if (hasOwn(input, 'businessSlug')) {
    const slug = toSlug(input.businessSlug);
    if (input.businessSlug === null || input.businessSlug === '') {
      values.businessSlug = null;
    } else if (!slug) {
      errors.push('businessSlug must contain at least one alphanumeric character.');
    } else {
      values.businessSlug = slug;
    }
  }

  if (hasOwn(input, 'brandSearch')) {
    values.brandSearch = toNullableString(input.brandSearch);
  }

  if (hasOwn(input, 'mid')) {
    values.mid = toNullableString(input.mid);
  }

  if (hasOwn(input, 'destinationAddress')) {
    values.destinationAddress = toNullableString(input.destinationAddress);
  }

  if (hasOwn(input, 'destinationZip')) {
    values.destinationZip = toNullableString(input.destinationZip);
  }

  if (hasOwn(input, 'destLat')) {
    const lat = toNullableFloat(input.destLat, { min: -90, max: 90 });
    if (lat === undefined) {
      errors.push('destLat must be a valid latitude between -90 and 90.');
    } else {
      values.destLat = lat;
    }
  }

  if (hasOwn(input, 'destLng')) {
    const lng = toNullableFloat(input.destLng, { min: -180, max: 180 });
    if (lng === undefined) {
      errors.push('destLng must be a valid longitude between -180 and 180.');
    } else {
      values.destLng = lng;
    }
  }

  if (hasOwn(input, 'timezone')) {
    values.timezone = toNullableString(input.timezone);
  }

  if (hasOwn(input, 'drivesPerDay')) {
    const drives = toNullableInt(input.drivesPerDay, { min: 0 });
    if (drives === undefined) {
      errors.push('drivesPerDay must be a non-negative integer or empty.');
    } else {
      values.drivesPerDay = drives;
    }
  }

  if (hasOwn(input, 'isActive')) {
    const flag = toBooleanFlag(input.isActive);
    if (flag === undefined) {
      errors.push('isActive must be a boolean value.');
    } else {
      values.isActive = flag;
    }
  }

  if (hasOwn(input, 'gPlaceId')) {
    values.gPlaceId = toNullableString(input.gPlaceId);
  }

  return { errors, values };
}

export function mapToDbColumns(values) {
  return Object.entries(values).reduce((acc, [key, value]) => {
    if (FIELD_MAP[key]) {
      acc[FIELD_MAP[key]] = value;
    }
    return acc;
  }, {});
}

export function wasProvided(payload, key) {
  return hasOwn(payload, key);
}
