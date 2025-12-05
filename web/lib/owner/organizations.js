export function parseOrganizationId(raw) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  return value;
}

export async function deleteOrganizationData(connection, organizationId) {
  const [businessRows] = await connection.query(
    'SELECT id FROM businesses WHERE organization_id = ? FOR UPDATE',
    [organizationId]
  );

  const businessIds = businessRows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id));

  if (!businessIds.length) {
    await connection.query('DELETE FROM organization_trials WHERE organization_id = ?', [organizationId]);
    return;
  }

  const [runRows] = await connection.query(
    'SELECT id FROM runs WHERE business_id IN (?) FOR UPDATE',
    [businessIds]
  );

  const runIds = runRows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id));

  if (runIds.length) {
    await connection.query('DELETE FROM run_logs WHERE run_id IN (?)', [runIds]);
    await connection.query('DELETE FROM ranking_snapshots WHERE run_id IN (?)', [runIds]);
  }

  await connection.query('DELETE FROM run_logs WHERE business_id IN (?)', [businessIds]);
  await connection.query('DELETE FROM ranking_snapshots WHERE business_id IN (?)', [businessIds]);
  await connection.query('DELETE FROM ranking_queries WHERE business_id IN (?)', [businessIds]);
  await connection.query('DELETE FROM runs WHERE business_id IN (?)', [businessIds]);

  await connection.query('DELETE FROM geo_grid_runs WHERE business_id IN (?)', [businessIds]);
  await connection.query('DELETE FROM geo_grid_schedules WHERE business_id IN (?)', [businessIds]);
  await connection.query('DELETE FROM geo_grid_schedule_keywords WHERE business_id IN (?)', [businessIds]);
  await connection.query('DELETE FROM origin_zones WHERE business_id IN (?)', [businessIds]);
  await connection.query('DELETE FROM gbp_task_completions WHERE business_id IN (?)', [businessIds]);
  await connection.query('DELETE FROM gbp_authorizations WHERE business_id IN (?)', [businessIds]);
  await connection.query('DELETE FROM gbp_profile_cache WHERE business_id IN (?)', [businessIds]);
  await connection.query('DELETE FROM business_hours WHERE business_id IN (?)', [businessIds]);
  await connection.query('DELETE FROM soax_configs WHERE business_id IN (?)', [businessIds]);
  await connection.query('DELETE FROM review_snapshots WHERE business_id IN (?)', [businessIds]);
  await connection.query('DELETE FROM review_fetch_tasks WHERE business_id IN (?)', [businessIds]);

  await connection.query('DELETE FROM businesses WHERE id IN (?)', [businessIds]);
  await connection.query('DELETE FROM organization_trials WHERE organization_id = ?', [organizationId]);
}

export async function loadOrganizationLock(connection, organizationId) {
  const [rows] = await connection.query('SELECT id, name FROM organizations WHERE id = ? FOR UPDATE', [organizationId]);
  if (!rows.length) {
    return null;
  }

  const record = rows[0];
  return {
    id: Number(record.id),
    name: record.name || ''
  };
}

export async function loadOrganizationMembersForDeletion(connection, organizationId) {
  const [memberRows] = await connection.query(
    `SELECT u.id, u.firebase_uid AS firebaseUid
       FROM user_org_members m
       JOIN users u ON u.id = m.user_id
      WHERE m.organization_id = ?
      FOR UPDATE`,
    [organizationId]
  );

  return memberRows.map((row) => ({
    id: Number(row.id),
    firebaseUid: row.firebaseUid
  }));
}

export async function deleteOrganizationMembers(connection, memberRecords, organizationId) {
  await connection.query('DELETE FROM user_org_members WHERE organization_id = ?', [organizationId]);

  if (!memberRecords.length) {
    return [];
  }

  const userIds = memberRecords.map((member) => member.id).filter((id) => Number.isFinite(id));

  if (!userIds.length) {
    return [];
  }

  await connection.query('DELETE FROM users WHERE id IN (?)', [userIds]);
  return userIds;
}
