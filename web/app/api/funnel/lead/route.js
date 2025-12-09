import { NextResponse } from 'next/server';
import pool from '@lib/db/db.js';
import { loadOptimizationData } from '@/lib/optimizationData';

export const runtime = 'nodejs';

function validateEmail(value) {
  if (typeof value !== 'string') {
    return false;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailPattern.test(trimmed.toLowerCase());
}

function normalizePlacePayload(place) {
  if (!place || typeof place !== 'object') {
    return null;
  }

  const placeId = typeof place.placeId === 'string' ? place.placeId.trim() : '';
  if (!placeId) {
    return null;
  }

  const normalized = {
    placeId,
    name: typeof place.name === 'string' ? place.name.trim() : '',
    formattedAddress: typeof place.formattedAddress === 'string' ? place.formattedAddress.trim() : '',
    location: null
  };

  const locationSource = place.location || place.coords || null;
  if (locationSource) {
    const latCandidate = locationSource.lat ?? locationSource.latitude;
    const lngCandidate = locationSource.lng ?? locationSource.longitude;
    const lat = Number(latCandidate);
    const lng = Number(lngCandidate);

    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      normalized.location = { lat, lng };
    }
  }

  return normalized;
}

function safeStringify(payload) {
  if (!payload) {
    return null;
  }

  try {
    return JSON.stringify(payload);
  } catch (error) {
    console.warn('Failed to serialize funnel lead payload', error);
    return null;
  }
}

function parseJson(value) {
  if (!value) {
    return null;
  }

  try {
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch (error) {
    console.warn('Failed to parse funnel lead payload', error);
    return null;
  }
}

async function collectPreviewAsync(leadRecord, startedAt = new Date()) {
  try {
    await pool.query(
      `UPDATE funnel_leads
          SET preview_status = 'pending',
              preview_error = NULL,
              preview_started_at = COALESCE(preview_started_at, ?),
              updated_at = UTC_TIMESTAMP()
        WHERE id = ?`,
      [startedAt, leadRecord.id]
    );

    await loadOptimizationData(leadRecord.place_id);
    const completedAt = new Date();

    await pool.query(
      `UPDATE funnel_leads
          SET preview_status = 'completed',
              preview_error = NULL,
              preview_started_at = COALESCE(preview_started_at, ?),
              preview_completed_at = ?,
              updated_at = UTC_TIMESTAMP()
        WHERE id = ?`,
      [startedAt, completedAt, leadRecord.id]
    );

    return completedAt;
  } catch (error) {
    console.error('Funnel preview fetch failed', error);

    const message = error?.message || 'Failed to collect Google Business Profile data.';
    await pool.query(
      `UPDATE funnel_leads
          SET preview_status = 'error',
              preview_error = ?,
              preview_completed_at = NULL,
              updated_at = UTC_TIMESTAMP()
        WHERE id = ?`,
      [message.slice(0, 500), leadRecord.id]
    );

    throw error;
  }
}

function mapLeadRow(row) {
  return {
    id: row.id,
    email: row.email,
    place_id: row.place_id,
    place_name: row.place_name || '',
    place_address: row.place_address || '',
    place_lat: row.place_lat === null || row.place_lat === undefined ? null : Number(row.place_lat),
    place_lng: row.place_lng === null || row.place_lng === undefined ? null : Number(row.place_lng),
    place_metadata: parseJson(row.place_metadata_json),
    preview_status: row.preview_status,
    preview_error: row.preview_error,
    preview_started_at: row.preview_started_at ? new Date(row.preview_started_at) : null,
    preview_completed_at: row.preview_completed_at ? new Date(row.preview_completed_at) : null
  };
}

function buildResponsePlace(record) {
  if (!record) {
    return null;
  }

  const location =
    record.place_lat !== null && record.place_lng !== null
      ? { lat: record.place_lat, lng: record.place_lng }
      : record.place_metadata?.location ?? null;

  return {
    placeId: record.place_id,
    name: record.place_name || '',
    formattedAddress: record.place_address || '',
    location
  };
}

const LEAD_SELECT_FIELDS = `id, email, place_id, place_name, place_address, place_lat, place_lng,
  place_metadata_json, preview_status, preview_error, preview_started_at, preview_completed_at`;

async function fetchLeadByEmail(connection, email) {
  const [rows] = await connection.query(
    `SELECT ${LEAD_SELECT_FIELDS}
       FROM funnel_leads
      WHERE email = ?
      LIMIT 1`,
    [email]
  );

  if (!rows.length) {
    return null;
  }

  return mapLeadRow(rows[0]);
}

async function fetchLeadById(connection, id) {
  const [rows] = await connection.query(
    `SELECT ${LEAD_SELECT_FIELDS}
       FROM funnel_leads
      WHERE id = ?
      LIMIT 1`,
    [id]
  );

  if (!rows.length) {
    return null;
  }

  return mapLeadRow(rows[0]);
}

export async function POST(request) {
  try {
    const payload = await request.json().catch(() => null);

    if (!payload || typeof payload !== 'object') {
      return NextResponse.json({ error: 'Invalid request payload.' }, { status: 400 });
    }

    const { email, place } = payload;

    if (!validateEmail(email)) {
      return NextResponse.json({ error: 'A valid email address is required.' }, { status: 400 });
    }

    const normalizedPlace = normalizePlacePayload(place);
    if (!normalizedPlace?.placeId) {
      return NextResponse.json({ error: 'A Google Business Profile selection is required.' }, { status: 400 });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const connection = await pool.getConnection();

    let leadRecord;
    let leadExisted = false;

    try {
      await connection.beginTransaction();

      leadRecord = await fetchLeadByEmail(connection, trimmedEmail);

      if (leadRecord) {
        leadExisted = true;
      } else {
        const metadataJson = safeStringify(normalizedPlace);
        const lat = normalizedPlace.location?.lat ?? null;
        const lng = normalizedPlace.location?.lng ?? null;

        const [result] = await connection.query(
          `INSERT INTO funnel_leads (
             email,
             place_id,
             place_name,
             place_address,
             place_lat,
             place_lng,
             place_metadata_json,
             preview_status,
             preview_started_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', UTC_TIMESTAMP())`,
          [
            trimmedEmail,
            normalizedPlace.placeId,
            normalizedPlace.name || null,
            normalizedPlace.formattedAddress || null,
            lat,
            lng,
            metadataJson
          ]
        );

        leadRecord = await fetchLeadById(connection, result.insertId);
      }

      await connection.commit();
    } catch (error) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error('Failed to rollback funnel lead transaction', rollbackError);
      }

      throw error;
    } finally {
      connection.release();
    }

    if (!leadRecord) {
      return NextResponse.json({ error: 'Unable to save your preview request.' }, { status: 500 });
    }

    const reusedPreview = Boolean(leadExisted && leadRecord.preview_completed_at);
    const shouldFetchPreview = !leadRecord.preview_completed_at;
    let previewStartedAt = leadRecord.preview_started_at ?? null;
    let previewCompletedAt = leadRecord.preview_completed_at ?? null;

    if (shouldFetchPreview) {
      const startedAt = previewStartedAt ?? new Date();
      previewStartedAt = startedAt;

      collectPreviewAsync(leadRecord, startedAt).catch((error) => {
        console.error('Funnel preview fetch failed', error);
      });
    }

    const responsePlace = buildResponsePlace(leadRecord) || normalizedPlace;

    return NextResponse.json(
      {
        leadId: leadRecord.id,
        email: trimmedEmail,
        place: responsePlace,
        existingPreview: reusedPreview,
        previewStartedAt: previewStartedAt?.toISOString() ?? null,
        previewCompletedAt: previewCompletedAt?.toISOString() ?? null
      },
      { status: leadExisted ? 200 : 201 }
    );
  } catch (error) {
    console.error('Funnel lead capture failed', error);
    return NextResponse.json(
      { error: 'We could not start your preview right now. Please try again shortly.' },
      { status: 500 }
    );
  }
}
