export function mapTicketTypeBranches(type, branchLinks = []) {
  const scopeMode = type.scope_mode || "ALL";
  const branchIds = branchLinks.filter((link) => link.ticket_type_id === type.id).map((link) => link.branch_id);
  return {
    scopeMode,
    branchIds,
    allBranches: scopeMode !== "SELECTED",
    targetBranchMode: type.target_branch_mode || "REQUESTER",
    targetBranchId: type.target_branch_id || null,
  };
}

export function isTicketTypeAvailableForBranch(type, branchId, branchLinks = []) {
  if (!type?.active) return false;
  const scopeMode = type.scope_mode || "ALL";
  if (scopeMode !== "SELECTED") return true;
  const branchIds = branchLinks.filter((link) => link.ticket_type_id === type.id).map((link) => link.branch_id);
  return branchIds.includes(branchId);
}

export function resolveHandlingBranchId(db, ticketType, originBranchId, organizationId) {
  const mode = ticketType.target_branch_mode || "REQUESTER";
  if (mode === "MATRIZ") {
    const matriz = db.prepare("SELECT id FROM branches WHERE organization_id=? AND type='MATRIZ' ORDER BY created_at LIMIT 1").get(organizationId);
    return matriz?.id || originBranchId;
  }
  if (mode === "SPECIFIC" && ticketType.target_branch_id) {
    const target = db.prepare("SELECT id FROM branches WHERE id=? AND organization_id=?").get(ticketType.target_branch_id, organizationId);
    if (target) return target.id;
  }
  return originBranchId;
}

export function getTargetBranchLabel(mode) {
  return {
    REQUESTER: "Unidade do solicitante",
    MATRIZ: "Matriz",
    SPECIFIC: "Unidade específica",
  }[mode] || "Unidade do solicitante";
}

export function saveTicketTypeBranches(db, ticketTypeId, scopeMode, branchIds = []) {
  db.prepare("DELETE FROM ticket_type_branches WHERE ticket_type_id=?").run(ticketTypeId);
  if (scopeMode !== "SELECTED" || !branchIds.length) return;
  const insert = db.prepare("INSERT INTO ticket_type_branches (ticket_type_id, branch_id) VALUES (?, ?)");
  branchIds.forEach((branchId) => insert.run(ticketTypeId, branchId));
}
