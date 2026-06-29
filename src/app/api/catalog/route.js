import { can, requireCurrentUser } from "@/lib/auth";
import { getDb, makeId } from "@/lib/db";
import { mapTicketTypeBranches, saveTicketTypeBranches } from "@/lib/ticket-type-routing";
import { z } from "zod";

export const dynamic = "force-dynamic";

const branchConfigSchema = {
  scopeMode: z.enum(["ALL", "SELECTED"]).optional().default("ALL"),
  branchIds: z.array(z.string().min(1)).optional().default([]),
  targetBranchMode: z.enum(["REQUESTER", "MATRIZ", "SPECIFIC"]).optional().default("REQUESTER"),
  targetBranchId: z.string().nullable().optional(),
};

function validateBranchConfig(data, organizationId, db) {
  if (data.scopeMode === "SELECTED" && !data.branchIds.length) {
    return "Selecione ao menos uma unidade para disponibilizar este tipo.";
  }
  if (data.targetBranchMode === "SPECIFIC") {
    if (!data.targetBranchId) return "Selecione a unidade de destino do chamado.";
    const target = db.prepare("SELECT id FROM branches WHERE id=? AND organization_id=?").get(data.targetBranchId, organizationId);
    if (!target) return "Unidade de destino inválida.";
  }
  if (data.scopeMode === "SELECTED") {
    const placeholders = data.branchIds.map(() => "?").join(",");
    const valid = db.prepare(`SELECT COUNT(*) count FROM branches WHERE organization_id=? AND id IN (${placeholders})`).get(organizationId, ...data.branchIds).count;
    if (valid !== data.branchIds.length) return "Uma ou mais unidades selecionadas são inválidas.";
  }
  return null;
}

export function listCatalog(db, organizationId) {
  const types = db.prepare("SELECT * FROM ticket_types WHERE organization_id=? ORDER BY active DESC, name").all(organizationId);
  const fields = db.prepare("SELECT * FROM ticket_fields ORDER BY position").all();
  const branchLinks = db.prepare(`
    SELECT ttb.ticket_type_id, ttb.branch_id, b.name branch_name, b.type branch_type
    FROM ticket_type_branches ttb
    JOIN branches b ON b.id=ttb.branch_id
    JOIN ticket_types tt ON tt.id=ttb.ticket_type_id
    WHERE tt.organization_id=?
  `).all(organizationId);
  const branches = db.prepare("SELECT id, name, type FROM branches WHERE organization_id=? ORDER BY type, name").all(organizationId);
  const matrizBranch = branches.find((branch) => branch.type === "MATRIZ") || null;

  return types.map((type) => {
    const routing = mapTicketTypeBranches(type, branchLinks);
    const linkedBranches = branchLinks.filter((link) => link.ticket_type_id === type.id);
    const targetBranch = type.target_branch_id ? branches.find((branch) => branch.id === type.target_branch_id) : null;
    return {
      ...type,
      active: Boolean(type.active),
      categoryId: type.category_id || null,
      requiresApproval: Boolean(type.requires_approval),
      approvalMode: type.approval_mode || "NONE",
      defaultApproverId: type.default_approver_id || null,
      requiresTerm: Boolean(type.requires_term),
      termTemplateId: type.term_template_id || null,
      ...routing,
      branchNames: linkedBranches.map((link) => link.branch_name),
      targetBranchName: routing.targetBranchMode === "MATRIZ"
        ? matrizBranch?.name || "Matriz"
        : targetBranch?.name || null,
      checklist: (() => { try { return type.checklist_json ? JSON.parse(type.checklist_json) : []; } catch { return []; } })(),
      fields: fields.filter((field) => field.ticket_type_id === type.id).map((field) => ({
        ...field,
        required: Boolean(field.required),
        options: field.options_json ? JSON.parse(field.options_json) : [],
      })),
    };
  });
}

export async function GET(request) {
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  const currentUser = auth.user;
  const db = getDb();
  let catalog = listCatalog(db, currentUser.organization_id);
  if (currentUser.role !== "ADMIN") {
    catalog = catalog.filter((type) => type.active);
    catalog = catalog.filter((type) => type.allBranches || type.branchIds.some((id) => currentUser.branchIds.includes(id)));
  }
  return Response.json({ catalog });
}

export async function POST(request) {
  const auth = requireCurrentUser(request);
  if (auth.error) return auth.error;
  const currentUser = auth.user;
  if (!can(currentUser, "ticket_types", "create")) return Response.json({ error: "Sem permissão." }, { status: 403 });
  const schema = z.object({
    name: z.string().min(3).max(100),
    description: z.string().max(300).optional(),
    kind: z.enum(["INCIDENTE", "REQUISICAO"]),
    category: z.string().min(2).max(80).optional(),
    categoryId: z.string().nullable().optional(),
    defaultPriority: z.enum(["BAIXA", "MEDIA", "ALTA", "CRITICA"]),
    fields: z.array(z.object({
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
    ...branchConfigSchema,
  });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Revise os dados do tipo de chamado." }, { status: 400 });
  const db = getDb();
  const branchError = validateBranchConfig(parsed.data, currentUser.organization_id, db);
  if (branchError) return Response.json({ error: branchError }, { status: 400 });
  const id = makeId("tipo");
  const now = new Date().toISOString();
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
  let categoryName = parsed.data.category || "Geral";
  let categoryId = parsed.data.categoryId || null;
  if (categoryId) {
    const cat = db.prepare("SELECT id, name FROM ticket_categories WHERE id=? AND organization_id=?").get(categoryId, currentUser.organization_id);
    if (!cat) return Response.json({ error: "Categoria inválida." }, { status: 400 });
    categoryName = cat.name;
  }
  const checklistJson = JSON.stringify((parsed.data.checklist || []).map((item, index) => ({ id: item.id || `chk-${index}`, label: item.label })));
  const save = db.transaction(() => {
    db.prepare(`INSERT INTO ticket_types
      (id, organization_id, name, description, kind, category, category_id, default_priority, active, created_at,
       requires_approval, approval_mode, default_approver_id, requires_term, term_template_id,
       scope_mode, target_branch_mode, target_branch_id, checklist_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, currentUser.organization_id, parsed.data.name, parsed.data.description || "", parsed.data.kind, categoryName, categoryId, parsed.data.defaultPriority, now,
        requiresApproval ? 1 : 0, approvalMode, approvalMode === "FIXED" ? parsed.data.defaultApproverId : null,
        parsed.data.requiresTerm ? 1 : 0, parsed.data.requiresTerm ? parsed.data.termTemplateId : null,
        parsed.data.scopeMode, parsed.data.targetBranchMode,
        parsed.data.targetBranchMode === "SPECIFIC" ? parsed.data.targetBranchId : null, checklistJson);
    saveTicketTypeBranches(db, id, parsed.data.scopeMode, parsed.data.branchIds);
    const insertField = db.prepare(`INSERT INTO ticket_fields
      (id, ticket_type_id, label, field_type, placeholder, required, options_json, position)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    parsed.data.fields.forEach((field, index) => insertField.run(makeId("fld"), id, field.label, field.fieldType, field.placeholder || "", field.required ? 1 : 0, field.options?.length ? JSON.stringify(field.options) : null, index));
  });
  save();
  return Response.json({ id, catalog: listCatalog(db, currentUser.organization_id) }, { status: 201 });
}
