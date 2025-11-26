// /app/api/sidebar/route.js
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { NextResponse } from 'next/server';

export async function POST(req) {
  try {
    const { geometry, placeId, options } = await req.json();

    if (!placeId) {
      return NextResponse.json({ error: 'Missing placeId' }, { status: 400 });
    }

    // Dynamically import from outside Next.js build
    const { fetchPlaceSidebarData } = await import('@lib/google/placesSidebar.js');

    // Call your real async function with all expected args
    const data = await fetchPlaceSidebarData(geometry, placeId, options || {});

    return NextResponse.json(data);
  } catch (err) {
    console.error('Sidebar API failed:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
