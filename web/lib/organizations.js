export function resolveOrganizationScope(input) {
  if (input && typeof input === 'object') {
    const hasOrganizationId = 'organizationId' in input;
    const organizationId = hasOrganizationId ? input.organizationId ?? null : null;
    const canAccessAllOrganizations = Boolean(input.canAccessAllOrganizations);
    const role = typeof input.role === 'string' ? input.role : null;

    return {
      organizationId,
      canAccessAllOrganizations: canAccessAllOrganizations || role === 'admin'
    };
  }

  const organizationId = input ?? null;
  const canAccessAllOrganizations = organizationId === null || organizationId === 1;

  return { organizationId, canAccessAllOrganizations };
}

export function buildOrganizationScopeClause(scope, column = 'organization_id') {
  const { organizationId, canAccessAllOrganizations } = resolveOrganizationScope(scope);

  return {
    clause: `(? = 1 OR ${column} = ?)`,
    params: [canAccessAllOrganizations ? 1 : 0, organizationId]
  };
}
