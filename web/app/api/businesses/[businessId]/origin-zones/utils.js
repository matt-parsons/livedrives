const FIELD_MAP = {
  name: 'name',
  canonical: 'canonical',
  zip: 'zip',
  lat: 'lat',
  lng: 'lng',
  radiusMi: 'radius_mi',
  weight: 'weight',
  keywords: 'keywords'
};

function toKeywordEntries(raw) {
  const entries = [];

  const addEntry = (termValue, weightValue) => {
    if (termValue === null || termValue === undefined) {
      return;
    }

    const term = String(termValue).trim();

    if (!term) {
      return;
    }

    const weightNumber = Number(weightValue);
    const weight = Number.isFinite(weightNumber) && weightNumber > 0 ? weightNumber : 1;

    entries.push({ term, weight });
  };

  const consumeArray = (list) => {
    for (const entry of list) {
      if (!entry && entry !== 0) {
        continue;
      }

      if (typeof entry === 'string' || typeof entry === 'number') {
        addEntry(entry, 1);
        continue;
      }

      if (typeof entry === 'object') {
        const candidateTerm = entry.term ?? entry.keyword ?? entry.value ?? entry.name ?? entry.label;
        const candidateWeight = entry.weight ?? entry.score ?? entry.boost;
        addEntry(candidateTerm, candidateWeight);
      }
    }
  };

  if (raw === null || raw === undefined) {
    return entries;
  }

  if (typeof raw === 'string') {
    const trimmed = raw.trim();

    if (!trimmed) {
      return entries;
    }

    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);

        if (Array.isArray(parsed)) {
          consumeArray(parsed);
          return entries;
        }
      } catch (error) {
        console.warn('Failed to parse keywords JSON, falling back to delimiter parsing', error);
      }
    }

    trimmed
      .split(/[,;\n]+/)
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach((term) => addEntry(term, 1));

    return entries;
  }

  if (Array.isArray(raw)) {
    consumeArray(raw);
    return entries;
  }

  if (typeof raw === 'object') {
    const candidateTerm = raw.term ?? raw.keyword ?? raw.value ?? raw.name ?? raw.label;
    const candidateWeight = raw.weight ?? raw.score ?? raw.boost;
    addEntry(candidateTerm, candidateWeight);
  }

  return entries;
}

function normalizeKeywords(raw) {
  const entries = toKeywordEntries(raw);

  if (!entries.length) {
    return { errors: ['Provide at least one keyword.'], value: null };
  }

  const deduped = [];
  const seen = new Set();

  for (const entry of entries) {
    const key = entry.term.toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(entry);
  }

  return { errors: [], value: JSON.stringify(deduped) };
}

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

export function normalizeOriginZonePayload(input, { partial = false } = {}) {
  if (!input || typeof input !== 'object') {
    return { errors: ['Request body must be a JSON object.'], values: {} };
  }

  const errors = [];
  const values = {};

  if (!partial || hasOwn(input, 'name')) {
    values.name = toNullableString(input.name);
  }

  if (!partial || hasOwn(input, 'canonical')) {
    values.canonical = toNullableString(input.canonical);
  }

  if (!partial || hasOwn(input, 'zip')) {
    values.zip = toNullableString(input.zip);
  }

  if (!partial || hasOwn(input, 'lat')) {
    const lat = toNullableFloat(input.lat, { min: -90, max: 90 });
    if (lat === undefined || lat === null) {
      errors.push('Latitude must be a number between -90 and 90.');
    } else {
      values.lat = lat;
    }
  }

  if (!partial || hasOwn(input, 'lng')) {
    const lng = toNullableFloat(input.lng, { min: -180, max: 180 });
    if (lng === undefined || lng === null) {
      errors.push('Longitude must be a number between -180 and 180.');
    } else {
      values.lng = lng;
    }
  }

  if (!partial || hasOwn(input, 'radiusMi')) {
    const radius = toNullableFloat(input.radiusMi, { min: 0 });
    if (radius === undefined) {
      errors.push('radiusMi must be a non-negative number or empty.');
    } else {
      values.radiusMi = radius;
    }
  }

  if (!partial || hasOwn(input, 'weight')) {
    const weight = toNullableFloat(input.weight, { min: 0 });
    if (weight === undefined) {
      errors.push('weight must be a non-negative number or empty.');
    } else {
      values.weight = weight;
    }
  }

  if (!partial || hasOwn(input, 'keywords')) {
    const { errors: keywordErrors, value } = normalizeKeywords(input.keywords);
    errors.push(...keywordErrors);
    values.keywords = value;
  }

  return { errors, values };
}

export function mapToDbColumns(values) {
  return Object.entries(values).reduce((acc, [key, value]) => {
    if (FIELD_MAP[key] !== undefined) {
      acc[FIELD_MAP[key]] = value;
    }
    return acc;
  }, {});
}

export function wasProvided(payload, key) {
  return hasOwn(payload, key);
}

export function formatZoneRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    businessId: row.business_id,
    name: row.name ?? null,
    canonical: row.canonical ?? null,
    zip: row.zip ?? null,
    lat: row.lat === null || row.lat === undefined ? null : Number(row.lat),
    lng: row.lng === null || row.lng === undefined ? null : Number(row.lng),
    radiusMi: row.radius_mi === null || row.radius_mi === undefined ? null : Number(row.radius_mi),
    weight: row.weight === null || row.weight === undefined ? null : Number(row.weight),
    keywords: row.keywords ?? null,
    createdAt: row.created_at ?? null
  };
}
