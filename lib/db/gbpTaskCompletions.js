const pool = require('./db');

function normalizeRow(row) {
  if (!row) {
    return null;
  }

  return {
    businessId: row.business_id,
    taskId: row.task_id,
    status: row.status,
    markedBy: row.marked_by ?? null,
    markedAt: row.marked_at ? new Date(row.marked_at) : null,
    notes: row.notes ?? null,
    resolvedAt: row.resolved_at ? new Date(row.resolved_at) : null
  };
}

async function loadTaskCompletions(businessId) {
  if (!businessId) {
    return [];
  }

  const [rows] = await pool.query(
    `SELECT business_id,
            task_id,
            status,
            marked_by,
            marked_at,
            notes,
            resolved_at
       FROM gbp_task_completions
      WHERE business_id = ?`,
    [businessId]
  );

  return rows.map(normalizeRow).filter(Boolean);
}

async function fetchCompletion(businessId, taskId) {
  const [rows] = await pool.query(
    `SELECT business_id,
            task_id,
            status,
            marked_by,
            marked_at,
            notes,
            resolved_at
       FROM gbp_task_completions
      WHERE business_id = ?
        AND task_id = ?
      LIMIT 1`,
    [businessId, taskId]
  );

  return normalizeRow(rows[0] ?? null);
}

async function markTaskCompletion({ businessId, taskId, userId = null, status = 'pending', notes = null }) {
  if (!businessId) {
    throw new Error('Business ID is required to mark a task complete.');
  }

  const normalizedTaskId = typeof taskId === 'string' ? taskId.trim() : '';

  if (!normalizedTaskId) {
    throw new Error('Task identifier is required to mark a task complete.');
  }

  await pool.query(
    `INSERT INTO gbp_task_completions (
        business_id,
        task_id,
        status,
        marked_by,
        marked_at,
        notes,
        resolved_at
      ) VALUES (?, ?, ?, ?, UTC_TIMESTAMP(), ?, NULL)
      ON DUPLICATE KEY UPDATE
        status = VALUES(status),
        marked_by = VALUES(marked_by),
        marked_at = VALUES(marked_at),
        notes = VALUES(notes),
        resolved_at = NULL`,
    [businessId, normalizedTaskId, status, userId ?? null, notes ?? null]
  );

  return fetchCompletion(businessId, normalizedTaskId);
}

module.exports = {
  loadTaskCompletions,
  markTaskCompletion
};

module.exports.default = module.exports;
