import { AuthError, requireAuth } from '@/lib/authServer';
import { requireBusiness } from '../utils';

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

function buildPrompt(business, idea) {
  const context = [
    `Business name: ${business.businessName || 'N/A'}`,
    `Brand search/alias: ${business.brandSearch || 'N/A'}`,
    `Address: ${business.destinationAddress || 'N/A'}`,
    `ZIP/postal: ${business.destinationZip || 'N/A'}`,
    `Latitude/Longitude: ${business.destLat ?? 'N/A'}, ${business.destLng ?? 'N/A'}`,
    `Time zone: ${business.timezone || 'N/A'}`
  ];

  const userIdea = normalizeString(idea)
    ? `The user wants to focus on: ${normalizeString(idea)}`
    : 'The user did not include a specific promo or idea.';

  return [
    'You are an assistant who writes short Google Business Profile posts for local service companies.',
    'Keep the tone friendly and straightforward.',
    'Write a single post with a 6-10 word headline and a 2-3 sentence body.',
    'Offer a concise call-to-action label for the GBP button (3 words max).',
    'Return JSON using exactly this shape:',
    '{"headline": "...", "body": "...", "callToAction": "...", "linkUrl": "..."}',
    '',
    userIdea,
    'Business context:',
    context.join('\n')
  ].join('\n');
}

function parseGeneratedPost(messageContent) {
  if (!messageContent) {
    return null;
  }

  const cleaned = messageContent.replace(/^```json\n?|```$/g, '').trim();

  try {
    const parsed = JSON.parse(cleaned);
    return {
      headline: normalizeString(parsed.headline),
      body: normalizeString(parsed.body),
      callToAction: normalizeString(parsed.callToAction) ?? 'Learn more',
      linkUrl: normalizeString(parsed.linkUrl)
    };
  } catch (error) {
    console.error('Failed to parse generated GBP post', error, messageContent);
    return null;
  }
}

async function generatePost(prompt) {
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
        { role: 'system', content: 'You write concise Google Business Profile posts.' },
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
  const post = parseGeneratedPost(message);

  if (!post) {
    throw new Error('No content was returned by the model.');
  }

  return post;
}

export async function POST(request, { params }) {
  const businessId = Number(params?.businessId);

  if (!Number.isFinite(businessId) || businessId <= 0) {
    return Response.json({ error: 'Invalid business identifier.' }, { status: 400 });
  }

  try {
    const session = await requireAuth(request);
    const business = await requireBusiness(session, businessId);

    if (!business) {
      return Response.json({ error: 'Business not found.' }, { status: 404 });
    }

    if (!OPENAI_API_KEY) {
      return Response.json(
        { error: 'Post drafting is unavailable because the AI key is missing.' },
        { status: 503 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const idea = normalizeString(body.idea) || normalizeString(body.prompt) || '';
    const prompt = buildPrompt(business, idea);
    const post = await generatePost(prompt);

    return Response.json({ post });
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }

    console.error(
      `Failed to generate GBP post for business ${params?.businessId}`,
      error?.message || error
    );
    return Response.json({ error: 'Failed to generate a post draft.' }, { status: 500 });
  }
}
