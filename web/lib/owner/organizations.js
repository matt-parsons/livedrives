function parseBusinessIds(rawValues) {
  if (!Array.isArray(rawValues)) {
    return [];
  }

  return rawValues
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0);
}

export function parseOrganizationId(raw) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  return value;
}

async function deleteBusinesses(connection, businessIds) {
  const normalizedBusinessIds = parseBusinessIds(businessIds);

  if (!normalizedBusinessIds.length) {
    return [];
  }

  // Tables without ON DELETE CASCADE/SET NULL from businesses
  await connection.query('DELETE FROM business_hours WHERE business_id IN (?)', [normalizedBusinessIds]);
  await connection.query('DELETE FROM runs WHERE business_id IN (?)', [normalizedBusinessIds]);
  await connection.query('DELETE FROM soax_configs WHERE business_id IN (?)', [normalizedBusinessIds]);
  await connection.query('DELETE FROM review_snapshots WHERE business_id IN (?)', [normalizedBusinessIds]);
  await connection.query('DELETE FROM review_fetch_tasks WHERE business_id IN (?)', [normalizedBusinessIds]);

  // This will trigger all ON DELETE CASCADE and ON DELETE SET NULL on other tables.
  await connection.query('DELETE FROM businesses WHERE id IN (?)', [normalizedBusinessIds]);

  return normalizedBusinessIds;
}

export async function deleteBusinessData(connection, businessId) {
  return deleteBusinesses(connection, [businessId]);
}

export async function deleteOrganizationData(connection, organizationId) {
  const [businessRows] = await connection.query(
    'SELECT id FROM businesses WHERE organization_id = ? FOR UPDATE',
    [organizationId]
  );

  const businessIds = parseBusinessIds(businessRows.map((row) => row.id));

  const deletedBusinessIds = await deleteBusinesses(connection, businessIds);

  if (Number.isFinite(organizationId)) {
    await connection.query('DELETE FROM organization_trials WHERE organization_id = ?', [organizationId]);
  }

  return deletedBusinessIds;
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
