// /app/api/sidebar/route.js
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { NextResponse } from 'next/server';

function resolveProvider(options = {}) {
  const configured = (process.env.SIDEBAR_PROVIDER || 'dataforseo').toLowerCase();
  const requested = options.provider?.toString().toLowerCase();

  if (requested === 'legacy' || requested === 'puppeteer') return 'legacy';
  if (requested === 'dataforseo') return 'dataforseo';

  return configured === 'legacy' || configured === 'puppeteer' ? 'legacy' : 'dataforseo';
}

export async function POST(req) {
  try {
    const { geometry, placeId, options = {} } = await req.json();

    if (!placeId) {
      return NextResponse.json({ error: 'Missing placeId' }, { status: 400 });
    }

    const provider = resolveProvider(options);

    if (provider === 'dataforseo') {
      const { fetchPlaceSidebarDataForSeo } = await import('@lib/google/placesSidebarDataForSeo.js');
      const data = await fetchPlaceSidebarDataForSeo(placeId, { ...options, signal: req.signal });
      return NextResponse.json(data);
    }

    const { fetchPlaceSidebarData } = await import('@lib/google/placesSidebar.js');
    const data = await fetchPlaceSidebarData(geometry, placeId, options);
    return NextResponse.json(data);
  } catch (err) {
    console.error('Sidebar API failed:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
