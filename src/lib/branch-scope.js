const placeholders = (values) => values.map(() => "?").join(",");

// Escopo de unidades do usuário. "Vê todas" deriva do flag explícito all_branches
// (não mais do papel ADMIN), permitindo restringir um admin a uma unidade específica.
export function getAllowedBranchIds(user, db, requestedBranchId = null) {
  const allowed = user.all_branches
    ? db.prepare("SELECT id FROM branches WHERE organization_id=?").all(user.organization_id).map((item) => item.id)
    : [...user.branchIds];
  if (requestedBranchId && allowed.includes(requestedBranchId)) return [requestedBranchId];
  return allowed;
}

export function branchFilterClause(branchIds, column = "branch_id") {
  if (!branchIds.length) return { clause: `${column} IS NULL`, params: [] };
  return { clause: `${column} IN (${placeholders(branchIds)})`, params: branchIds };
}

export function canAccessBranch(user, branchId) {
  if (!branchId) return Boolean(user.all_branches);
  if (user.all_branches) return true;
  return user.branchIds.includes(branchId);
}

export function assertBranchAccess(user, branchId) {
  if (!canAccessBranch(user, branchId)) {
    return { denied: true, message: "Sem permissão para esta unidade." };
  }
  return null;
}

export function filterByBranchScope(items, branchIds, key = "branch_id") {
  if (!branchIds?.length) return [];
  return items.filter((item) => !item[key] || branchIds.includes(item[key]));
}
