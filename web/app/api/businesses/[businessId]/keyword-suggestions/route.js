import pool from '@lib/db/db.js';
import { AuthError, requireAuth } from '@/lib/authServer';
import { buildOrganizationScopeClause } from '@/lib/organizations';
import { BUSINESS_FIELDS } from '@/app/dashboard/[business]/helpers';

export const runtime = 'nodejs';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

function normalizeString(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const str = String(value).trim();
  return str.length ? str : null;
}

function buildPrompt(business) {
  const parts = [
    `Business name: ${business.businessName || 'N/A'}`,
    `Known as/brand search: ${business.brandSearch || 'N/A'}`,
    `Address: ${business.destinationAddress || 'N/A'}`,
    `ZIP/postal code: ${business.destinationZip || 'N/A'}`,
    `Latitude/Longitude: ${business.destLat ?? 'N/A'}, ${business.destLng ?? 'N/A'}`,
    `Time zone: ${business.timezone || 'N/A'}`
  ];

  return [
    'You are a local search expert who talks in plain, blue-collar language.',
    'Pick the 3 best non-brand search keywords to track for this business.',
    'Use short phrases that real customers type into Google (service + city/neighborhood).',
    'Keep the wording simple and avoid SEO jargon.',
    'Explain why each keyword is a good fit in one or two friendly sentences.',
    'Respond with JSON using the exact shape:',
    '{"keywords": [{"keyword": "...", "reason": "..."}, {"keyword": "...", "reason": "..."}, {"keyword": "...", "reason": "..."}]}',
    '',
    'Business profile:',
    parts.join('\n')
  ].join('\n');
}

function parseSuggestions(messageContent) {
  if (!messageContent) {
    return [];
  }

  const cleaned = messageContent.replace(/^```json\n?|```$/g, '').trim();

  try {
    const parsed = JSON.parse(cleaned);
    const items = Array.isArray(parsed.keywords) ? parsed.keywords : [];

    return items
      .map((item) => ({
        keyword: normalizeString(item.keyword),
        reason: normalizeString(item.reason)
      }))
      .filter((item) => item.keyword && item.reason)
      .slice(0, 3);
  } catch (error) {
    console.error('Failed to parse keyword suggestions', error, messageContent);
    return [];
  }
}

async function fetchKeywordSuggestions(prompt) {
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key is not configured.');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You are a helpful assistant for local service businesses.' },
        { role: 'user', content: prompt }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`OpenAI request failed (${response.status}): ${errorText || 'unknown error'}`);
  }

  const payload = await response.json();
  const message = payload?.choices?.[0]?.message?.content || '';
  const suggestions = parseSuggestions(message);

  if (!suggestions.length) {
    throw new Error('No keyword suggestions were returned.');
  }

  return suggestions;
}

export async function GET(request, { params }) {
  const rawBusinessId = params?.businessId;
  const businessId = Number(rawBusinessId);

  if (!Number.isFinite(businessId) || businessId <= 0) {
    return Response.json({ error: 'Invalid business identifier.' }, { status: 400 });
  }

  try {
    const session = await requireAuth(request);
    const scope = buildOrganizationScopeClause(session);

    const [rows] = await pool.query(
      `SELECT ${BUSINESS_FIELDS}
         FROM businesses
        WHERE id = ?
          AND ${scope.clause}
        LIMIT 1`,
      [businessId, ...scope.params]
    );

    if (!rows.length) {
      return Response.json({ error: 'Business not found.' }, { status: 404 });
    }

    if (!OPENAI_API_KEY) {
      return Response.json(
        { error: 'Keyword suggestions are unavailable because the AI key is missing.' },
        { status: 503 }
      );
    }

    const prompt = buildPrompt(rows[0]);
    const suggestions = await fetchKeywordSuggestions(prompt);

    return Response.json({ suggestions });
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }

    console.error(`Failed to generate keyword suggestions for business ${rawBusinessId}`, error);
    return Response.json({ error: 'Failed to generate keyword suggestions.' }, { status: 500 });
  }
}
