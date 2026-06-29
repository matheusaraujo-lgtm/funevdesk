import { can, requireCurrentUser } from "@/lib/auth";
import { getDb, makeId } from "@/lib/db";
import { saveTicketTypeBranches } from "@/lib/ticket-type-routing";
import { listCatalog } from "@/app/api/catalog/route";
import { z } from "zod";

export const dynamic = "force-dynamic";

function mapType(type) {
  return {
    ...type,
    active: Boolean(type.active),
    requiresApproval: Boolean(type.requires_approval),
    approvalMode: type.approval_mode || "NONE",
    defaultApproverId: type.default_approver_id || null,
    requiresTerm: Boolean(type.requires_term),
    termTemplateId: type.term_template_id || null,
  };
}

const branchConfigSchema = {
  scopeMode: z.enum(["ALL", "SELECTED"]).optional(),
  branchIds: z.array(z.string().min(1)).optional(),
  targetBranchMode: z.enum(["REQUESTER", "MATRIZ", "SPECIFIC"]).optional(),
  targetBranchId: z.string().nullable().optional(),
};

function validateBranchConfig(data, organizationId, db) {
  if (data.scopeMode === "SELECTED" && !data.branchIds?.length) {
    return "Selecione ao menos uma unidade para disponibilizar este tipo.";
  }
  if (data.targetBranchMode === "SPECIFIC") {
    if (!data.targetBranchId) return "Selecione a unidade de destino do chamado.";
    const target = db.prepare("SELECT id FROM branches WHERE id=? AND organization_id=?").get(data.targetBranchId, organizationId);
    if (!target) return "Unidade de destino inválida.";
  }
  if (data.scopeMode === "SELECTED" && data.branchIds?.length) {
    const placeholders = data.branchIds.map(() => "?").join(",");
    const valid = db.prepare(`SELECT COUNT(*) count FROM branches WHERE organization_id=? AND id IN (${placeholders})`).get(organizationId, ...data.branchIds).count;
    if (valid !== data.branchIds.length) return "Uma ou mais unidades selecionadas são inválidas.";
  }
  return null;
}

const typeSchema = z.object({
  name: z.string().min(3).max(100),
  description: z.string().max(300).optional(),
  kind: z.enum(["INCIDENTE", "REQUISICAO"]),
  category: z.string().min(2).max(80).optional(),
  categoryId: z.string().nullable().optional(),
  defaultPriority: z.enum(["BAIXA", "MEDIA", "ALTA", "CRITICA"]),
  fields: z.array(z.object({
    id: z.string().optional(),
    label: z.string().min(2).max(100),
    fieldType: z.enum(["TEXT", "TEXTAREA", "SELECT", "DATE", "FILE", "SCREENSHOT", "LOCATION", "STOCK"]),
    placeholder: z.string().max(160).optional(),
    required: z.boolean(),
    options: z.array(z.string().min(1)).optional(),
  })).min(1),
  requiresApproval: z.boolean().optional().default(false),
  approvalMode: z.enum(["NONE", "FIXED", "SELECT"]).optional().default("NONE"),
  defaultApproverId: z.string().nullable().optional(),
  requiresTerm: z.boolean().optional().default(false),
  termTemplateId: z.string().nullable().optional(),
  checklist: z.array(z.object({ id: z.string().optional(), label: z.string().min(1).max(120) })).max(50).optional().default([]),
  scopeMode: z.enum(["ALL", "SELECTED"]).optional().default("ALL"),
  branchIds: z.array(z.string().min(1)).optional().default([]),
  targetBranchMode: z.enum(["REQUESTER", "MATRIZ", "SPECIFIC"]).optional().default("REQUESTER"),
  targetBranchId: z.string().nullable().optional(),
});

export async function PUT(request, { params }) {
  const { id } = await params;
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (!can(auth.user, "ticket_types", "update")) return Response.json({ error: "Sem permissão." }, { status: 403 });
  const parsed = typeSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Revise os dados do tipo de chamado." }, { status: 400 });
  const db = getDb();
  const type = db.prepare("SELECT * FROM ticket_types WHERE id=? AND organization_id=?").get(id, auth.user.organization_id);
  if (!type) return Response.json({ error: "Tipo não encontrado." }, { status: 404 });

  const branchError = validateBranchConfig(parsed.data, auth.user.organization_id, db);
  if (branchError) return Response.json({ error: branchError }, { status: 400 });

  const requiresApproval = parsed.data.requiresApproval;
  let approvalMode = parsed.data.approvalMode;
  if (!requiresApproval) approvalMode = "NONE";
  else if (approvalMode === "NONE") approvalMode = "SELECT";
  if (approvalMode === "FIXED" && !parsed.data.defaultApproverId) {
    return Response.json({ error: "Informe o aprovador padrão." }, { status: 400 });
  }
  if (parsed.data.requiresTerm && !parsed.data.termTemplateId) {
    return Response.json({ error: "Selecione um modelo de termo." }, { status: 400 });
  }

  let categoryName = parsed.data.category || type.category;
  let categoryId = parsed.data.categoryId ?? type.category_id ?? null;
  if (categoryId) {
    const cat = db.prepare("SELECT name FROM ticket_categories WHERE id=? AND organization_id=?").get(categoryId, auth.user.organization_id);
    if (!cat) return Response.json({ error: "Categoria inválida." }, { status: 400 });
    categoryName = cat.name;
  }

  const existingFields = db.prepare("SELECT id FROM ticket_fields WHERE ticket_type_id=?").all(id);
  const incomingIds = parsed.data.fields.map((f) => f.id).filter(Boolean);
  const removedIds = existingFields.map((f) => f.id).filter((fieldId) => !incomingIds.includes(fieldId));
  for (const fieldId of removedIds) {
    const used = db.prepare("SELECT COUNT(*) count FROM ticket_responses WHERE field_id=?").get(fieldId).count;
    if (used > 0) return Response.json({ error: "Campos usados em chamados existentes não podem ser removidos." }, { status: 409 });
  }

  const save = db.transaction(() => {
    db.prepare(`UPDATE ticket_types SET name=?, description=?, kind=?, category=?, category_id=?, default_priority=?,
      requires_approval=?, approval_mode=?, default_approver_id=?, requires_term=?, term_template_id=?,
      scope_mode=?, target_branch_mode=?, target_branch_id=?, checklist_json=?
      WHERE id=?`)
      .run(
        parsed.data.name, parsed.data.description || "", parsed.data.kind, categoryName, categoryId, parsed.data.defaultPriority,
        requiresApproval ? 1 : 0, approvalMode, approvalMode === "FIXED" ? parsed.data.defaultApproverId : null,
        parsed.data.requiresTerm ? 1 : 0, parsed.data.requiresTerm ? parsed.data.termTemplateId : null,
        parsed.data.scopeMode, parsed.data.targetBranchMode,
        parsed.data.targetBranchMode === "SPECIFIC" ? parsed.data.targetBranchId : null,
        JSON.stringify((parsed.data.checklist || []).map((item, index) => ({ id: item.id || `chk-${index}`, label: item.label }))),
        id
      );
    saveTicketTypeBranches(db, id, parsed.data.scopeMode, parsed.data.branchIds);
    const updateField = db.prepare(`UPDATE ticket_fields SET label=?, field_type=?, placeholder=?, required=?, options_json=?, position=? WHERE id=? AND ticket_type_id=?`);
    const insertField = db.prepare(`INSERT INTO ticket_fields (id, ticket_type_id, label, field_type, placeholder, required, options_json, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    parsed.data.fields.forEach((field, index) => {
      const optionsJson = field.options?.length ? JSON.stringify(field.options) : null;
      if (field.id && existingFields.some((f) => f.id === field.id)) {
        updateField.run(field.label, field.fieldType, field.placeholder || "", field.required ? 1 : 0, optionsJson, index, field.id, id);
      } else {
        insertField.run(makeId("fld"), id, field.label, field.fieldType, field.placeholder || "", field.required ? 1 : 0, optionsJson, index);
      }
    });
    for (const fieldId of removedIds) db.prepare("DELETE FROM ticket_fields WHERE id=?").run(fieldId);
  });
  save();
  return Response.json({ catalog: listCatalog(db, auth.user.organization_id) });
}

const workflowSchema = z.object({
  requiresApproval: z.boolean().optional(),
  approvalMode: z.enum(["NONE", "FIXED", "SELECT"]).optional(),
  defaultApproverId: z.string().nullable().optional(),
  requiresTerm: z.boolean().optional(),
  termTemplateId: z.string().nullable().optional(),
});

export async function PATCH(request, { params }) {
  const { id } = await params;
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  if (!can(auth.user, "ticket_types", "update")) return Response.json({ error: "Sem permissão." }, { status: 403 });
  const parsed = workflowSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Dados inválidos." }, { status: 400 });
  const db = getDb();
  const type = db.prepare("SELECT * FROM ticket_types WHERE id=? AND organization_id=?").get(id, auth.user.organization_id);
  if (!type) return Response.json({ error: "Tipo não encontrado." }, { status: 404 });

  const requiresApproval = parsed.data.requiresApproval !== undefined ? parsed.data.requiresApproval : Boolean(type.requires_approval);
  let approvalMode = parsed.data.approvalMode ?? type.approval_mode ?? "NONE";
  if (!requiresApproval) approvalMode = "NONE";
  else if (approvalMode === "NONE") approvalMode = "SELECT";

  const defaultApproverId = parsed.data.defaultApproverId !== undefined ? parsed.data.defaultApproverId : type.default_approver_id;
  if (approvalMode === "FIXED" && !defaultApproverId) {
    return Response.json({ error: "Informe o aprovador padrão para o modo fixo." }, { status: 400 });
  }

  const requiresTerm = parsed.data.requiresTerm !== undefined ? parsed.data.requiresTerm : Boolean(type.requires_term);
  const termTemplateId = parsed.data.termTemplateId !== undefined ? parsed.data.termTemplateId : type.term_template_id;
  if (requiresTerm && !termTemplateId) {
    return Response.json({ error: "Selecione um modelo de termo." }, { status: 400 });
  }

  db.prepare(`UPDATE ticket_types SET
    requires_approval=?, approval_mode=?, default_approver_id=?,
    requires_term=?, term_template_id=?
    WHERE id=?`)
    .run(requiresApproval ? 1 : 0, approvalMode, approvalMode === "FIXED" ? defaultApproverId : null, requiresTerm ? 1 : 0, requiresTerm ? termTemplateId : null, id);

  return Response.json({ ok: true, type: mapType(db.prepare("SELECT * FROM ticket_types WHERE id=?").get(id)) });
}
