const DEFAULT_SELECTION_LIMIT = 20;

function addTerm(list, seen, term, weight = 1) {
  if (!term && term !== 0) {
    return;
  }

  const text = String(term).trim();
  if (!text) {
    return;
  }

  const key = text.toLowerCase();
  if (seen.has(key)) {
    return;
  }

  seen.add(key);
  list.push({ term: text, weight: Number.isFinite(weight) ? weight : 1 });
}

function parseKeywordEntries(raw) {
  if (raw === null || raw === undefined) {
    return [];
  }

  const entries = [];
  const seen = new Set();

  const consumeArray = (list) => {
    for (const entry of list) {
      if (!entry && entry !== 0) {
        continue;
      }

      if (typeof entry === 'string' || typeof entry === 'number') {
        addTerm(entries, seen, entry, 1);
        continue;
      }

      if (typeof entry === 'object') {
        const candidateTerm = entry.term ?? entry.keyword ?? entry.value ?? entry.name ?? entry.label;
        const candidateWeight = entry.weight ?? entry.score ?? entry.boost;
        addTerm(entries, seen, candidateTerm, candidateWeight);
      }
    }
  };

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
      } catch {
        // fall through to delimiter parsing
      }
    }

    trimmed
      .split(/[;,\n]+/)
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach((term) => addTerm(entries, seen, term, 1));

    return entries;
  }

  if (Array.isArray(raw)) {
    consumeArray(raw);
    return entries;
  }

  if (typeof raw === 'object') {
    const candidateTerm = raw.term ?? raw.keyword ?? raw.value ?? raw.name ?? raw.label;
    const candidateWeight = raw.weight ?? raw.score ?? raw.boost;
    addTerm(entries, seen, candidateTerm, candidateWeight);
  }

  return entries;
}

function normalizeKeywordSelections(keywords, { limit = DEFAULT_SELECTION_LIMIT } = {}) {
  const normalized = [];
  const seen = new Set();

  if (!Array.isArray(keywords)) {
    return normalized;
  }

  for (const keyword of keywords) {
    if (keyword === null || keyword === undefined) {
      continue;
    }

    const text = String(keyword).trim();
    if (!text) {
      continue;
    }

    const key = text.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalized.push(text.slice(0, 255));

    if (normalized.length >= limit) {
      break;
    }
  }

  return normalized;
}

function collectAvailableKeywordsFromZones(zones) {
  if (!Array.isArray(zones) || !zones.length) {
    return [];
  }

  const entries = [];
  const seen = new Map();

  for (const zone of zones) {
    const keywordWeightBase = Number(zone?.weight ?? 1);
    const parsed = parseKeywordEntries(zone?.keywords ?? []);

    for (const entry of parsed) {
      const weight = (Number.isFinite(keywordWeightBase) ? keywordWeightBase : 1)
        * (Number.isFinite(entry.weight) ? entry.weight : 1);
      const key = entry.term.toLowerCase();
      const existing = seen.get(key);

      if (!existing || weight > existing.weight) {
        const record = { term: entry.term, weight };
        seen.set(key, record);
      }
    }
  }

  seen.forEach((value) => entries.push(value));

  return entries
    .sort((a, b) => {
      if (b.weight !== a.weight) {
        return b.weight - a.weight;
      }
      return a.term.localeCompare(b.term);
    })
    .map((entry) => entry.term);
}

module.exports = {
  collectAvailableKeywordsFromZones,
  normalizeKeywordSelections,
  parseKeywordEntries
};

module.exports.default = module.exports;
