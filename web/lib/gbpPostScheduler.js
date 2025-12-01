import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'node:crypto';

const DEFAULT_STORAGE_PATH =
  process.env.GBP_POST_SCHEDULE_PATH || path.resolve(process.cwd(), '../reports/gbp-posts.json');

async function readStore(filePath = DEFAULT_STORAGE_PATH) {
  try {
    const contents = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(contents);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }

    console.error('Failed to read GBP post schedule', error);
    return [];
  }
}

async function writeStore(entries, filePath = DEFAULT_STORAGE_PATH) {
  const safeEntries = Array.isArray(entries) ? entries : [];
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(safeEntries, null, 2), 'utf8');
}

function normalizeId(value) {
  if (value && typeof value === 'string') {
    return value;
  }

  return crypto.randomUUID();
}

function normalizeStatus(status) {
  const normalized = typeof status === 'string' ? status.toLowerCase() : '';

  if (['scheduled', 'draft', 'published'].includes(normalized)) {
    return normalized;
  }

  return 'scheduled';
}

export async function listScheduledPostsForBusiness(businessId) {
  const numericBusinessId = Number(businessId);
  const entries = await readStore();

  return entries
    .filter((entry) => Number(entry.businessId) === numericBusinessId)
    .map((entry) => ({
      ...entry,
      businessId: numericBusinessId,
      status: normalizeStatus(entry.status)
    }))
    .sort((a, b) => {
      const first = a.scheduledFor || a.scheduled_at || a.runAt || a.run_at || '';
      const second = b.scheduledFor || b.scheduled_at || b.runAt || b.run_at || '';
      return String(first).localeCompare(String(second));
    });
}

export async function createScheduledPost(businessId, values) {
  const entries = await readStore();
  const now = new Date().toISOString();

  const payload = {
    id: normalizeId(values.id),
    businessId: Number(businessId),
    headline: values.headline ?? 'Untitled post',
    body: values.body ?? '',
    callToAction: values.callToAction ?? null,
    linkUrl: values.linkUrl ?? null,
    scheduledFor: values.scheduledFor ?? null,
    status: normalizeStatus(values.status),
    createdAt: values.createdAt ?? now,
    updatedAt: now
  };

  entries.push(payload);
  await writeStore(entries);

  return payload;
}

export async function updateScheduledPost(businessId, postId, updates) {
  const entries = await readStore();
  const index = entries.findIndex(
    (entry) => entry.id === postId && Number(entry.businessId) === Number(businessId)
  );

  if (index === -1) {
    return null;
  }

  const now = new Date().toISOString();
  const updated = {
    ...entries[index],
    ...updates,
    businessId: Number(businessId),
    id: entries[index].id,
    status: normalizeStatus(updates.status ?? entries[index].status),
    updatedAt: now
  };

  entries[index] = updated;
  await writeStore(entries);

  return updated;
}

export async function deleteScheduledPost(businessId, postId) {
  const entries = await readStore();
  const index = entries.findIndex(
    (entry) => entry.id === postId && Number(entry.businessId) === Number(businessId)
  );

  if (index === -1) {
    return false;
  }

  entries.splice(index, 1);
  await writeStore(entries);

  return true;
}
