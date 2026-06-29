import { canAccessTicket, getPermissions, requireCurrentUser } from "@/lib/auth";
import { createNotification } from "@/lib/notifications";
import { getDb, makeId } from "@/lib/db";
import { verifyUserPassword } from "@/lib/password-verify";
import { z } from "zod";

export const dynamic = "force-dynamic";

const prepareSchema = z.object({
  action: z.literal("prepare"),
  signerUserId: z.string().min(1),
  assetId: z.string().min(1),
  signerName: z.string().min(3).max(160),
  signerDocument: z.string().max(80).optional().default(""),
  title: z.string().min(3).max(200).optional(),
  bodyHtml: z.string().min(10).max(50000),
  layoutJson: z.any().optional(),
});

const signSchema = z.object({
  action: z.literal("sign").optional(),
  password: z.string().min(1),
  signatureText: z.string().min(3).max(240).optional(),
  signerName: z.string().min(3).max(160).optional(),
  signerDocument: z.string().max(80).optional().default(""),
});

const legacySignSchema = z.object({
  signerName: z.string().min(3).max(160),
  signerDocument: z.string().max(80).optional().default(""),
  signatureText: z.string().min(3).max(240),
});

function loadTicket(db, id) {
  return db.prepare(`
    SELECT t.*, tt.requires_term, tt.term_template_id
    FROM tickets t LEFT JOIN ticket_types tt ON tt.id=t.ticket_type_id WHERE t.id=?
  `).get(id);
}

function stripHtml(html) {
  return String(html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export async function POST(request, { params }) {
  const { id } = await params;
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  const body = await request.json();
  const db = getDb();
  const ticket = loadTicket(db, id);
  if (!ticket) return Response.json({ error: "Chamado não encontrado." }, { status: 404 });
  if (!canAccessTicket(auth.user, ticket)) return Response.json({ error: "Acesso negado." }, { status: 403 });
  if (!ticket.requires_term) return Response.json({ error: "Este chamado não exige termo de equipamento." }, { status: 400 });

  if (body.action === "prepare") {
    const parsed = prepareSchema.safeParse(body);
    if (!parsed.success) return Response.json({ error: "Dados do termo inválidos." }, { status: 400 });
    if (!getPermissions(auth.user).canManageTickets) {
      return Response.json({ error: "Apenas técnicos podem preparar o termo." }, { status: 403 });
    }
    return prepareTerm(db, ticket, auth.user, parsed.data);
  }

  const pending = db.prepare("SELECT * FROM equipment_terms WHERE ticket_id=? ORDER BY created_at DESC LIMIT 1").get(id);
  if (pending?.status === "PENDENTE_ASSINATURA") {
    const parsed = signSchema.safeParse({ ...body, action: "sign" });
    if (!parsed.success) return Response.json({ error: "Informe sua senha para confirmar a assinatura." }, { status: 400 });
    return await signPreparedTerm(db, ticket, auth.user, pending, parsed.data);
  }

  const legacy = legacySignSchema.safeParse(body);
  if (!legacy.success) return Response.json({ error: "Dados do termo inválidos." }, { status: 400 });
  if (!ticket.asset_id) return Response.json({ error: "Vincule um equipamento ao chamado antes de assinar o termo." }, { status: 400 });
  const existing = db.prepare("SELECT id FROM equipment_terms WHERE ticket_id=? AND status='ASSINADO'").get(id);
  if (existing) return Response.json({ error: "Termo já assinado para este chamado." }, { status: 409 });

  const now = new Date().toISOString();
  const termId = makeId("term");
  db.transaction(() => {
    db.prepare(`INSERT INTO equipment_terms
      (id, organization_id, branch_id, asset_id, user_id, ticket_id, term_template_id, signer_name, signer_document, signature_text, pdf_name, pdf_url, status, signed_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ASSINADO', ?, ?)`)
      .run(termId, ticket.organization_id, ticket.branch_id, ticket.asset_id, auth.user.id, id, ticket.term_template_id || null,
        legacy.data.signerName, legacy.data.signerDocument || null, legacy.data.signatureText,
        `${termId}.pdf`, `/api/terms/${termId}/pdf`, now, now);
    db.prepare("INSERT INTO ticket_events VALUES (?, ?, ?, ?, 'TERM_SIGNED', ?, ?)")
      .run(makeId("evt"), id, auth.user.id, auth.user.name, "Termo de equipamento assinado no chamado.", now);
    db.prepare("UPDATE tickets SET updated_at=? WHERE id=?").run(now, id);
  })();
  return Response.json({ id: termId, pdfUrl: `/api/terms/${termId}/pdf` }, { status: 201 });
}

function prepareTerm(db, ticket, currentUser, data) {
  const signer = db.prepare("SELECT id, name, active FROM users WHERE id=? AND organization_id=?").get(data.signerUserId, ticket.organization_id);
  if (!signer?.active) return Response.json({ error: "Usuário signatário inválido." }, { status: 404 });
  const asset = db.prepare("SELECT id FROM assets WHERE id=? AND organization_id=?").get(data.assetId, ticket.organization_id);
  if (!asset) return Response.json({ error: "Equipamento não encontrado." }, { status: 404 });

  const existing = db.prepare("SELECT id, status FROM equipment_terms WHERE ticket_id=? ORDER BY created_at DESC LIMIT 1").get(ticket.id);
  if (existing?.status === "ASSINADO") return Response.json({ error: "Termo já assinado." }, { status: 409 });

  const now = new Date().toISOString();
  const termId = existing?.id || makeId("term");
  const template = ticket.term_template_id
    ? db.prepare("SELECT title FROM term_templates WHERE id=?").get(ticket.term_template_id)
    : null;
  const title = data.title || template?.title || "Termo de equipamento";
  const bodyText = stripHtml(data.bodyHtml);
  const layoutValue = data.layoutJson ? JSON.stringify(data.layoutJson) : null;

  db.transaction(() => {
    if (existing) {
      db.prepare(`UPDATE equipment_terms SET branch_id=?, asset_id=?, signer_user_id=?, prepared_by_id=?, prepared_at=?,
        signer_name=?, signer_document=?, title=?, body_html=?, body_text=?, layout_json=?, status='PENDENTE_ASSINATURA',
        pdf_name=?, pdf_url=?, signature_text='', signed_at=NULL, user_id=? WHERE id=?`)
        .run(ticket.branch_id, data.assetId, signer.id, currentUser.id, now, data.signerName, data.signerDocument || null,
          title, data.bodyHtml, bodyText, layoutValue, `${termId}.pdf`, `/api/terms/${termId}/pdf`, signer.id, termId);
    } else {
      db.prepare(`INSERT INTO equipment_terms
        (id, organization_id, branch_id, asset_id, user_id, ticket_id, term_template_id, signer_user_id, prepared_by_id, prepared_at,
         signer_name, signer_document, signature_text, title, body_html, body_text, layout_json, pdf_name, pdf_url, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?, 'PENDENTE_ASSINATURA', ?)`)
        .run(termId, ticket.organization_id, ticket.branch_id, data.assetId, signer.id, ticket.id, ticket.term_template_id || null,
          signer.id, currentUser.id, now, data.signerName, data.signerDocument || null, title, data.bodyHtml, bodyText, layoutValue,
          `${termId}.pdf`, `/api/terms/${termId}/pdf`, now);
    }
    db.prepare("UPDATE tickets SET asset_id=?, updated_at=? WHERE id=?").run(data.assetId, now, ticket.id);
    db.prepare("INSERT INTO ticket_events VALUES (?, ?, ?, ?, 'TERM_PREPARED', ?, ?)")
      .run(makeId("evt"), ticket.id, currentUser.id, currentUser.name, `Termo preparado para assinatura de ${signer.name}.`, now);
  })();

  createNotification(db, {
    organizationId: ticket.organization_id,
    userId: signer.id,
    eventType: "TERM_SIGNATURE",
    title: `Assinar termo · Chamado #${ticket.number}`,
    body: ticket.title,
    referenceId: ticket.id,
    referenceType: "TICKET",
  });

  return Response.json({ id: termId, pdfUrl: `/api/terms/${termId}/pdf`, status: "PENDENTE_ASSINATURA" }, { status: 201 });
}

async function signPreparedTerm(db, ticket, currentUser, term, data) {
  if (term.signer_user_id && term.signer_user_id !== currentUser.id && currentUser.role === "EMPLOYEE") {
    return Response.json({ error: "Você não está autorizado a assinar este termo." }, { status: 403 });
  }
  const check = await verifyUserPassword(currentUser.id, data.password);
  if (!check.ok) return Response.json({ error: check.error }, { status: 401 });
  const now = new Date().toISOString();
  const signatureText = data.signatureText || term.signer_name || currentUser.name;
  db.transaction(() => {
    db.prepare("UPDATE equipment_terms SET status='ASSINADO', signature_text=?, signed_at=?, user_id=? WHERE id=?")
      .run(signatureText, now, currentUser.id, term.id);
    db.prepare("UPDATE tickets SET asset_id=?, updated_at=? WHERE id=?").run(term.asset_id, now, ticket.id);
    db.prepare("INSERT INTO ticket_events VALUES (?, ?, ?, ?, 'TERM_SIGNED', ?, ?)")
      .run(makeId("evt"), ticket.id, currentUser.id, currentUser.name, `Termo assinado por ${currentUser.name}.`, now);
  })();
  if (term.prepared_by_id) {
    createNotification(db, {
      organizationId: ticket.organization_id,
      userId: term.prepared_by_id,
      eventType: "TERM_SIGNED",
      title: `Termo assinado · Chamado #${ticket.number}`,
      body: `${currentUser.name} assinou o termo de equipamento.`,
      referenceId: ticket.id,
      referenceType: "TICKET",
    });
  }
  return Response.json({ id: term.id, pdfUrl: term.pdf_url, status: "ASSINADO" });
}
