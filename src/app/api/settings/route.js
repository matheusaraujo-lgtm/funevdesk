import { requireCurrentUser } from "@/lib/auth";
import { ensureEnrollmentKey, rotateEnrollmentKey } from "@/lib/agent";
import { getDb } from "@/lib/db";
import { parseSlaPolicy } from "@/lib/sla";
import { z } from "zod";

export const dynamic = "force-dynamic";

const slaPrioritySchema = z.object({
  firstResponseMinutes: z.number().int().min(1).max(100000),
  resolutionHours: z.number().int().min(1).max(8760),
}).partial();

const settingsSchema = z.object({
  organizationName: z.string().min(3).max(120),
  appName: z.string().min(2).max(80).optional(),
  logoUrl: z.string().max(300).optional().nullable(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  navigationMode: z.enum(["NAVBAR", "SIDEBAR"]).optional(),
  slaHours: z.number().int().min(1).max(720),
  remoteAccessEnabled: z.boolean(),
  automaticTicketsEnabled: z.boolean(),
  notificationsEnabled: z.boolean().optional(),
  escalationEnabled: z.boolean().optional(),
  businessHours: z.object({
    start: z.string(),
    end: z.string(),
    days: z.array(z.number()),
  }).optional(),
  ssoProvider: z.enum(["LOCAL", "AZURE_AD", "GOOGLE"]).optional(),
  reorderTicketTypeId: z.string().nullable().optional(),
  slaPolicy: z.object({
    CRITICA: slaPrioritySchema,
    ALTA: slaPrioritySchema,
    MEDIA: slaPrioritySchema,
    BAIXA: slaPrioritySchema,
  }).partial().optional(),
});

const typeSchema = z.object({ ticketTypeId: z.string().min(1), active: z.boolean() });
const regenerateSchema = z.object({ regenerateAgentEnrollmentKey: z.literal(true) });

export async function GET(request) {
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  const currentUser = auth.user;
  if (currentUser.role !== "ADMIN") return Response.json({ error: "Acesso restrito a administradores." }, { status: 403 });
  const db = getDb();
  const organization = db.prepare("SELECT id, name FROM organizations WHERE id=?").get(currentUser.organization_id);
  const settings = db.prepare("SELECT * FROM system_settings WHERE organization_id=?").get(currentUser.organization_id);
  // Nunca expõe o segredo em claro: apenas o prefixo mascarado da chave de enrollment.
  const enrollment = ensureEnrollmentKey(db, currentUser.organization_id);
  const assets = db.prepare(`
    SELECT id, hostname, agent_token_prefix, agent_token_hash, branch_id, status, last_seen_at
    FROM assets WHERE organization_id=? ORDER BY hostname LIMIT 200
  `).all(currentUser.organization_id);
  return Response.json({
    settings: {
      organizationName: organization.name,
      appName: settings?.app_name || "FunevDesk",
      logoUrl: settings?.logo_url || "",
      primaryColor: settings?.primary_color || "#102033",
      secondaryColor: settings?.secondary_color || "#bff2e6",
      navigationMode: settings?.navigation_mode || "SIDEBAR",
      slaHours: settings?.sla_hours || 8,
      remoteAccessEnabled: Boolean(settings?.remote_access_enabled ?? 1),
      automaticTicketsEnabled: Boolean(settings?.automatic_tickets_enabled ?? 1),
      notificationsEnabled: Boolean(settings?.notifications_enabled ?? 1),
      escalationEnabled: Boolean(settings?.escalation_enabled ?? 1),
      businessHours: JSON.parse(settings?.business_hours_json || '{"start":"08:00","end":"18:00","days":[1,2,3,4,5]}'),
      slaPolicy: parseSlaPolicy(settings?.sla_policy_json),
      ssoProvider: settings?.sso_provider || "LOCAL",
      reorderTicketTypeId: settings?.reorder_ticket_type_id || "",
      // Só o prefixo mascarado; o texto puro só aparece ao (re)gerar a chave.
      agentEnrollmentKeyPrefix: enrollment.prefix || "",
    },
    agentAssets: assets.map((a) => ({
      id: a.id,
      hostname: a.hostname,
      agentTokenPrefix: a.agent_token_prefix || "",
      tokenSet: Boolean(a.agent_token_hash),
      status: a.status,
      lastSeenAt: a.last_seen_at,
    })),
  });
}

export async function PATCH(request) {
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  const currentUser = auth.user;
  if (currentUser.role !== "ADMIN") return Response.json({ error: "Acesso restrito a administradores." }, { status: 403 });
  const body = await request.json();
  const db = getDb();
  const typeUpdate = typeSchema.safeParse(body);
  if (typeUpdate.success) {
    const result = db.prepare("UPDATE ticket_types SET active=? WHERE id=? AND organization_id=?").run(typeUpdate.data.active ? 1 : 0, typeUpdate.data.ticketTypeId, currentUser.organization_id);
    if (!result.changes) return Response.json({ error: "Tipo de chamado não encontrado." }, { status: 404 });
    return Response.json({ ok: true });
  }
  const regen = regenerateSchema.safeParse(body);
  if (regen.success) {
    // Gera nova chave, persiste apenas hash + prefixo e devolve o texto puro UMA vez.
    const { plaintextOnce, prefix } = rotateEnrollmentKey(db, currentUser.organization_id);
    return Response.json({ ok: true, agentEnrollmentKey: plaintextOnce, agentEnrollmentKeyPrefix: prefix });
  }
  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Revise as configurações." }, { status: 400 });
  const save = db.transaction(() => {
    db.prepare("UPDATE organizations SET name=? WHERE id=?").run(parsed.data.organizationName, currentUser.organization_id);
    db.prepare(`INSERT INTO system_settings
      (organization_id, sla_hours, remote_access_enabled, automatic_tickets_enabled, app_name, logo_url, primary_color, secondary_color, navigation_mode, notifications_enabled, escalation_enabled, business_hours_json, sso_provider, reorder_ticket_type_id, sla_policy_json, remote_provider, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NEXUS_WEBRTC', ?)
      ON CONFLICT(organization_id) DO UPDATE SET
        sla_hours=excluded.sla_hours,
        remote_access_enabled=excluded.remote_access_enabled,
        automatic_tickets_enabled=excluded.automatic_tickets_enabled,
        app_name=excluded.app_name,
        logo_url=excluded.logo_url,
        primary_color=excluded.primary_color,
        secondary_color=excluded.secondary_color,
        navigation_mode=excluded.navigation_mode,
        notifications_enabled=COALESCE(excluded.notifications_enabled, system_settings.notifications_enabled),
        escalation_enabled=COALESCE(excluded.escalation_enabled, system_settings.escalation_enabled),
        business_hours_json=COALESCE(excluded.business_hours_json, system_settings.business_hours_json),
        sso_provider=COALESCE(excluded.sso_provider, system_settings.sso_provider),
        reorder_ticket_type_id=COALESCE(excluded.reorder_ticket_type_id, system_settings.reorder_ticket_type_id),
        sla_policy_json=COALESCE(excluded.sla_policy_json, system_settings.sla_policy_json),
        remote_provider='NEXUS_WEBRTC',
        updated_at=excluded.updated_at`)
      .run(
        currentUser.organization_id,
        parsed.data.slaHours,
        parsed.data.remoteAccessEnabled ? 1 : 0,
        parsed.data.automaticTicketsEnabled ? 1 : 0,
        parsed.data.appName || "FunevDesk",
        parsed.data.logoUrl || null,
        parsed.data.primaryColor || "#102033",
        parsed.data.secondaryColor || "#bff2e6",
        parsed.data.navigationMode || "SIDEBAR",
        parsed.data.notificationsEnabled !== undefined ? (parsed.data.notificationsEnabled ? 1 : 0) : 1,
        parsed.data.escalationEnabled !== undefined ? (parsed.data.escalationEnabled ? 1 : 0) : 1,
        parsed.data.businessHours ? JSON.stringify(parsed.data.businessHours) : null,
        parsed.data.ssoProvider || "LOCAL",
        parsed.data.reorderTicketTypeId || null,
        parsed.data.slaPolicy ? JSON.stringify(parseSlaPolicy(parsed.data.slaPolicy)) : null,
        new Date().toISOString()
      );
  });
  save();
  return Response.json({ ok: true });
}
