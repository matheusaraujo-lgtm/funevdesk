import { getDb } from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import { logAudit } from "@/lib/audit";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/security";
import { z } from "zod";

// Resposta genérica única — NÃO revela se o e-mail/conta existe (anti enumeração).
const GENERIC_MESSAGE = "Se o e-mail existir, os administradores foram avisados.";
function genericOk() {
  return Response.json({ message: GENERIC_MESSAGE });
}

export async function POST(request) {
  const parsed = z.object({
    email: z.string().trim().min(3).max(120),
    organizationSlug: z.string().min(2).max(80).optional(),
  }).safeParse(await request.json());
  // Mesmo em erro de validação evitamos vazar detalhes; mantém UX simples.
  if (!parsed.success) return Response.json({ error: "Informe um e-mail válido." }, { status: 400 });

  // Rate limiting por IP e por e-mail (mesmo helper do login) para mitigar
  // abuso/enumeração e flood de notificações aos administradores.
  const ip = clientIp(request);
  const ipLimit = rateLimit(`forgot:ip:${ip}`, { limit: 10, windowMs: 15 * 60_000 });
  if (!ipLimit.allowed) return tooManyRequests(ipLimit.retryAfterMs);
  const email = parsed.data.email.toLowerCase();
  const emailLimit = rateLimit(`forgot:email:${email}`, { limit: 3, windowMs: 15 * 60_000 });
  if (!emailLimit.allowed) return tooManyRequests(emailLimit.retryAfterMs);

  const db = getDb();
  // Resolve a organização com a MESMA lógica do login: slug informado ou a primeira.
  const organization = parsed.data.organizationSlug
    ? db.prepare("SELECT id, name FROM organizations WHERE slug=?").get(parsed.data.organizationSlug)
    : db.prepare("SELECT id, name FROM organizations ORDER BY created_at LIMIT 1").get();
  // Não revele que a empresa não existe — responda genérico.
  if (!organization) return genericOk();

  const user = db.prepare(`
    SELECT id, name, email, active, auth_provider
    FROM users WHERE organization_id=? AND email=?
  `).get(organization.id, email);

  // Sem usuário, inativo ou LDAP (senha gerida fora do app): nada a fazer,
  // mas a resposta é idêntica para não revelar a situação da conta.
  const authProvider = user?.auth_provider || "LOCAL";
  if (!user || !user.active || authProvider !== "LOCAL") return genericOk();

  // Notifica cada ADMIN ativo da organização para que faça o reset manualmente
  // (o app já oferece reset por admin em /api/users/[id]/reset-password).
  const admins = db.prepare(`
    SELECT id FROM users
    WHERE organization_id=? AND role='ADMIN' AND active=1
  `).all(organization.id);

  const title = "Pedido de redefinição de senha";
  const body = `${user.name} (${user.email}) solicitou a redefinição de senha. Gere uma senha temporária pelo cadastro do usuário.`;
  for (const admin of admins) {
    createNotification(db, {
      organizationId: organization.id,
      userId: admin.id,
      eventType: "PASSWORD_RESET_REQUEST",
      title,
      body,
      referenceId: user.id,
      referenceType: "USER",
    });
  }

  // Auditoria: o solicitante é o ator do próprio pedido. NÃO altera senha nem gera token.
  logAudit(db, {
    organizationId: organization.id,
    actorId: user.id,
    actorName: user.name,
    entityType: "USER",
    entityId: user.id,
    action: "PASSWORD_RESET_REQUEST",
    details: { email: user.email, notifiedAdmins: admins.length },
  });

  return genericOk();
}
