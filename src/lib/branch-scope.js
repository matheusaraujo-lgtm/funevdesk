const placeholders = (values) => values.map(() => "?").join(",");

export function getAllowedBranchIds(user, db, requestedBranchId = null) {
  const allowed = user.role === "ADMIN"
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
  if (!branchId) return user.role === "ADMIN";
  if (user.role === "ADMIN") return true;
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
