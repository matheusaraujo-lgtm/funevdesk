import { makeId } from "@/lib/db";

export function logAudit(db, { organizationId, branchId = null, actorId, actorName, entityType, entityId, action, details }) {
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO audit_logs
    (id, organization_id, branch_id, actor_id, actor_name, entity_type, entity_id, action, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      makeId("aud"),
      organizationId,
      branchId,
      actorId ?? null,
      actorName,
      entityType,
      entityId,
      action,
      details ? JSON.stringify(details) : null,
      now,
    );
}
