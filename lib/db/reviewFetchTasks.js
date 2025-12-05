const pool = require('./db');

async function loadReviewFetchTask(businessId) {
  if (!businessId) {
    return null;
  }

  const [rows] = await pool.query(
    `SELECT business_id, place_id, task_id, status, last_checked_at, completed_at, error_message
       FROM review_fetch_tasks
      WHERE business_id = ?
      LIMIT 1`,
    [businessId]
  );

  if (!rows.length) {
    return null;
  }

  return {
    businessId: rows[0].business_id,
    placeId: rows[0].place_id ?? null,
    taskId: rows[0].task_id,
    status: rows[0].status,
    lastCheckedAt: rows[0].last_checked_at ? new Date(rows[0].last_checked_at) : null,
    completedAt: rows[0].completed_at ? new Date(rows[0].completed_at) : null,
    errorMessage: rows[0].error_message ?? null
  };
}

async function saveReviewFetchTask({
  businessId,
  placeId = null,
  taskId,
  status = 'pending',
  lastCheckedAt = new Date(),
  completedAt = null,
  errorMessage = null
}) {
  if (!businessId || !taskId) {
    return;
  }

  await pool.query(
    `INSERT INTO review_fetch_tasks (
        business_id,
        place_id,
        task_id,
        status,
        last_checked_at,
        completed_at,
        error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        place_id = VALUES(place_id),
        task_id = VALUES(task_id),
        status = VALUES(status),
        last_checked_at = VALUES(last_checked_at),
        completed_at = VALUES(completed_at),
        error_message = VALUES(error_message),
        updated_at = UTC_TIMESTAMP()`,
    [businessId, placeId, taskId, status, lastCheckedAt, completedAt, errorMessage]
  );
}

async function markReviewFetchTaskCompleted({ businessId, taskId }) {
  await saveReviewFetchTask({
    businessId,
    taskId,
    status: 'completed',
    completedAt: new Date(),
    lastCheckedAt: new Date(),
    errorMessage: null
  });
}

async function markReviewFetchTaskFailed({ businessId, taskId, errorMessage = null }) {
  await saveReviewFetchTask({
    businessId,
    taskId,
    status: 'failed',
    completedAt: new Date(),
    lastCheckedAt: new Date(),
    errorMessage
  });
}

module.exports = {
  loadReviewFetchTask,
  saveReviewFetchTask,
  markReviewFetchTaskCompleted,
  markReviewFetchTaskFailed
};

module.exports.default = module.exports;
