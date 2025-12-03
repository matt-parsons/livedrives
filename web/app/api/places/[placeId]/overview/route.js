import { NextResponse } from 'next/server';
import { loadOptimizationData } from '@/lib/optimizationData';

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

function safeStringify(payload) {
  try {
    return JSON.stringify(payload, null, 2);
  } catch (error) {
    console.warn('Failed to serialize payload for overview prompt', error);
    return '';
  }
}

function buildPrompt(place, roadmap) {
  const gbpData = safeStringify({ place, roadmap });

  return [
    'You are a local search expert who speaks in plain, blue-collar language.',
    'Review the Google Business Profile data provided below.',
    'Write a short overview (4-6 sentences) that explains:',
    '- The most important fixes needed and the impact they can have.',
    '- One or two things the profile is already doing well, if any.',
    'Avoid jargon and keep it conversational.',
    'Return JSON using exactly this shape: {"overview": "..."}',
    '',
    'Google Business Profile data (JSON):',
    gbpData || 'No GBP data was available.'
  ].join('\n');
}

function parseOverview(messageContent) {
  if (!messageContent) {
    return null;
  }

  const cleaned = messageContent.replace(/^```json\n?|```$/g, '').trim();

  try {
    const parsed = JSON.parse(cleaned);
    return normalizeString(parsed.overview);
  } catch (error) {
    console.error('Failed to parse profile overview', error, messageContent);
    return null;
  }
}

async function fetchProfileOverview(prompt) {
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
        { role: 'system', content: 'You provide practical advice for local service businesses.' },
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
  const overview = parseOverview(message);

  if (!overview) {
    throw new Error('No overview was returned by the model.');
  }

  return overview;
}

export async function GET(_request, { params }) {
  const placeId = params?.placeId;

  if (!placeId) {
    return NextResponse.json({ error: 'Place ID is required.' }, { status: 400 });
  }

  try {
    if (!OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'Profile overview is unavailable because the AI key is missing.' },
        { status: 503 }
      );
    }

    const { place, roadmap } = await loadOptimizationData(placeId);
    const prompt = buildPrompt(place, roadmap);
    const overview = await fetchProfileOverview(prompt);

    return NextResponse.json({ overview });
  } catch (error) {
    console.error(`Failed to generate profile overview for ${placeId}`, error);
    return NextResponse.json({ error: 'Failed to generate profile overview.' }, { status: 500 });
  }
}
