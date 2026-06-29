import { makeId } from "@/lib/db";

export function createNotification(db, { organizationId, userId, eventType, title, body, referenceId = null, referenceType = null }) {
  const now = new Date().toISOString();
  const id = makeId("ntf");
  db.prepare(`INSERT INTO notifications
    (id, organization_id, user_id, event_type, title, body, reference_id, reference_type, read_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`)
    .run(id, organizationId, userId, eventType, title, body, referenceId, referenceType, now);
  return id;
}

export function listUnread(db, userId) {
  return db.prepare(`
    SELECT * FROM notifications
    WHERE user_id=? AND read_at IS NULL
    ORDER BY created_at DESC
  `).all(userId);
}

export function markAllRead(db, userId) {
  const info = db.prepare("UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL")
    .run(new Date().toISOString(), userId);
  return info.changes;
}

export function markRead(db, userId, id) {
  const info = db.prepare("UPDATE notifications SET read_at=? WHERE id=? AND user_id=? AND read_at IS NULL")
    .run(new Date().toISOString(), id, userId);
  return info.changes;
}
