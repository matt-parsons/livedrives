// /app/api/places/posts-status/[taskId]/route.js
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { NextResponse } from 'next/server';
import { fetchDataForSeoPostsByTaskId } from '@lib/google/placesSidebarDataForSeo.js';

function resolveAuthHeader(options = {}) {
  const base64Token = options.authToken || process.env.DATAFORSEO_AUTH;
  const username = options.username || process.env.DATAFORSEO_USERNAME;
  const password = options.password || process.env.DATAFORSEO_PASSWORD;

  const token = base64Token || (username && password
    ? Buffer.from(`${username}:${password}`).toString('base64')
    : null);

  if (!token) {
    throw new Error('DataForSEO credentials are not configured.');
  }

  return `Basic ${token}`;
}

export async function GET(req, { params }) {
  const { taskId } = params;

  if (!taskId) {
    return NextResponse.json({ error: 'Missing taskId' }, { status: 400 });
  }

  try {
    const headers = {
      Authorization: resolveAuthHeader(),
      'Content-Type': 'application/json',
    };

    const posts = await fetchDataForSeoPostsByTaskId(taskId, headers);
    
    // The task is considered complete if the posts array is not empty.
    const isComplete = posts.length > 0;

    return NextResponse.json({ isComplete, posts });
  } catch (err) {
    console.error(`Failed to get status for task ${taskId}:`, err);
    return NextResponse.json({ error: err.message, isComplete: false }, { status: 500 });
  }
}
