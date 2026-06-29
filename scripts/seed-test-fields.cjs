/**
 * Seed de QA — cria um tipo de chamado que usa TODOS os tipos de campo, para
 * validar que cada um renderiza no formulário de "Novo chamado" e aparece no
 * detalhe do chamado.
 *
 *   node scripts/seed-test-fields.cjs
 *
 * Idempotente: pode rodar várias vezes. Cria/garante:
 *   - Tipo "QA · Todos os campos" (visível em todas as unidades) com 1 campo de
 *     cada tipo: TEXT, TEXTAREA, SELECT, DATE, FILE, SCREENSHOT, LOCATION, STOCK.
 *   - 2 localizações e 2 itens de estoque na matriz (para os selects de
 *     LOCATION e STOCK terem opções reais).
 *   - 1 chamado de exemplo já preenchido (sem anexos) para conferir o detalhe.
 */
const { getDb, makeId } = require("nexus-desk-db");

// Um campo de cada tipo suportado pelo catálogo (catalog-type-form-view · fieldTypeLabels).
const FIELDS = [
  { label: "Texto curto",        field_type: "TEXT",       required: 1, placeholder: "Ex.: código do erro", options: null },
  { label: "Texto longo",        field_type: "TEXTAREA",   required: 0, placeholder: "Descreva em detalhes", options: null },
  { label: "Lista de opções",    field_type: "SELECT",     required: 1, placeholder: "",                     options: ["Opção A", "Opção B", "Opção C"] },
  { label: "Data",               field_type: "DATE",       required: 0, placeholder: "",                     options: null },
  { label: "Arquivo",            field_type: "FILE",       required: 0, placeholder: "",                     options: null },
  { label: "Captura de tela",    field_type: "SCREENSHOT", required: 0, placeholder: "",                     options: null },
  { label: "Localização",        field_type: "LOCATION",   required: 0, placeholder: "",                     options: null },
  { label: "Item de estoque",    field_type: "STOCK",      required: 0, placeholder: "",                     options: ["Periféricos"] },
];

const TYPE_NAME = "QA · Todos os campos";

function run() {
  const db = getDb();
  const org = db.prepare("SELECT id FROM organizations ORDER BY created_at LIMIT 1").get();
  if (!org) throw new Error("Nenhuma organização encontrada. Rode o app uma vez para semear a base mínima.");
  const orgId = org.id;
  const branch = db.prepare("SELECT id FROM branches WHERE organization_id=? ORDER BY CASE type WHEN 'MATRIZ' THEN 0 ELSE 1 END LIMIT 1").get(orgId);
  if (!branch) throw new Error("Nenhuma unidade encontrada.");
  const branchId = branch.id;
  const now = new Date().toISOString();

  // set resiliente: ignora colunas que ainda não existem nesta base (migrações).
  const set = (sql, ...args) => { try { db.prepare(sql).run(...args); } catch { /* coluna ausente */ } };

  // 1) Localizações (para o campo LOCATION ter opções).
  const locationIds = [];
  for (const name of ["Recepção", "Sala de TI"]) {
    let loc = db.prepare("SELECT id FROM locations WHERE organization_id=? AND branch_id=? AND name=?").get(orgId, branchId, name);
    if (!loc) {
      const locId = makeId("loc");
      db.prepare("INSERT INTO locations (id, organization_id, branch_id, name, code, active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)")
        .run(locId, orgId, branchId, name, null, now);
      loc = { id: locId };
    }
    locationIds.push(loc.id);
  }

  // 2) Itens de estoque na categoria "Periféricos" (para o campo STOCK ter opções).
  const stockIds = [];
  for (const item of [{ name: "Mouse USB", qty: 25 }, { name: "Teclado ABNT2", qty: 12 }]) {
    let row = db.prepare("SELECT id FROM inventory_items WHERE organization_id=? AND branch_id=? AND name=?").get(orgId, branchId, item.name);
    if (!row) {
      const itemId = makeId("inv");
      db.prepare(`INSERT INTO inventory_items
        (id, organization_id, branch_id, name, sku, category, quantity, min_quantity, unit, active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'Periféricos', ?, 2, 'un', 1, ?, ?)`)
        .run(itemId, orgId, branchId, item.name, null, item.qty, now, now);
      row = { id: itemId };
    }
    stockIds.push(row.id);
  }

  // 3) Tipo de chamado com um campo de cada tipo (recria os campos a cada execução).
  let type = db.prepare("SELECT id FROM ticket_types WHERE organization_id=? AND name=?").get(orgId, TYPE_NAME);
  const typeId = type?.id || makeId("tipo");
  if (!type) {
    db.prepare(`INSERT INTO ticket_types
      (id, organization_id, name, description, kind, category, default_priority, active, created_at)
      VALUES (?, ?, ?, ?, 'INCIDENTE', 'Suporte', 'MEDIA', 1, ?)`)
      .run(typeId, orgId, TYPE_NAME, "Tipo de teste com todos os tipos de campo do formulário.", now);
  }
  // Garante disponibilidade em todas as unidades e roteamento padrão (colunas de migração).
  set("UPDATE ticket_types SET active=1 WHERE id=?", typeId);
  set("UPDATE ticket_types SET scope_mode='ALL' WHERE id=?", typeId);
  set("UPDATE ticket_types SET target_branch_mode='REQUESTER' WHERE id=?", typeId);
  db.prepare("DELETE FROM ticket_type_branches WHERE ticket_type_id=?").run(typeId);

  // Recria os campos do zero para refletir mudanças nesta lista.
  db.prepare("DELETE FROM ticket_fields WHERE ticket_type_id=?").run(typeId);
  const insertField = db.prepare(`INSERT INTO ticket_fields
    (id, ticket_type_id, label, field_type, placeholder, required, options_json, position)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  FIELDS.forEach((field, index) => insertField.run(
    makeId("fld"), typeId, field.label, field.field_type, field.placeholder || "",
    field.required, field.options?.length ? JSON.stringify(field.options) : null, index
  ));
  const fieldRows = db.prepare("SELECT id, field_type FROM ticket_fields WHERE ticket_type_id=? ORDER BY position").all(typeId);

  // 4) Chamado de exemplo já preenchido (TEXT/TEXTAREA/SELECT/DATE/STOCK + Localização).
  //    FILE/SCREENSHOT ficam de fora (exigem upload real pela interface).
  const requester = db.prepare("SELECT id, name FROM users WHERE organization_id=? AND active=1 ORDER BY CASE role WHEN 'EMPLOYEE' THEN 0 ELSE 1 END LIMIT 1").get(orgId);
  const alreadyHasSample = db.prepare("SELECT id FROM tickets WHERE organization_id=? AND ticket_type_id=? LIMIT 1").get(orgId, typeId);
  if (requester && !alreadyHasSample) {
    const number = db.prepare("SELECT COALESCE(MAX(number), 1000)+1 AS n FROM tickets").get().n;
    const ticketId = makeId("tkt");
    db.prepare(`INSERT INTO tickets
      (id, number, organization_id, branch_id, requester_id, title, description, category, kind, priority, status, source, created_at, updated_at, ticket_type_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'Suporte', 'INCIDENTE', 'MEDIA', 'ABERTO', 'PORTAL', ?, ?, ?)`)
      .run(ticketId, number, orgId, branchId, requester.id,
        "QA · chamado com todos os campos", "<p>Chamado de teste gerado pelo seed para validar a renderização dos campos.</p>", now, now, typeId);
    set("UPDATE tickets SET location_id=? WHERE id=?", locationIds[0], ticketId);

    const insertResponse = db.prepare(`INSERT INTO ticket_responses
      (id, ticket_id, field_id, field_label, field_type, value_text) VALUES (?, ?, ?, ?, ?, ?)`);
    const sampleValue = (field) => {
      switch (field.field_type) {
        case "TEXT": return "ERR-0042";
        case "TEXTAREA": return "O sistema fecha sozinho ao abrir o relatório mensal.";
        case "SELECT": return "Opção B";
        case "DATE": return now.slice(0, 10);
        case "STOCK": return JSON.stringify({ itemId: stockIds[0], qty: 1, deduct: false });
        default: return null; // FILE/SCREENSHOT/LOCATION não viram resposta de texto aqui
      }
    };
    for (const field of fieldRows) {
      const value = sampleValue(field);
      if (value) insertResponse.run(makeId("rsp"), ticketId, field.id, FIELDS.find((f) => f.field_type === field.field_type)?.label || field.field_type, field.field_type, value);
    }
    db.prepare("INSERT INTO ticket_events VALUES (?, ?, ?, ?, 'CREATED', ?, ?)")
      .run(makeId("evt"), ticketId, requester.id, requester.name, "Chamado de teste criado pelo seed.", now);
    console.log(`  • Chamado de exemplo #${number} criado.`);
  }

  console.log("\n✅ Seed de campos de QA concluído.");
  console.log("------------------------------------------------");
  console.log(`Tipo criado: "${TYPE_NAME}" (visível em todas as unidades)`);
  console.log(`Campos: ${FIELDS.map((f) => f.field_type).join(", ")}`);
  console.log("Abra 'Novo chamado' → selecione o tipo e confira os 8 campos.");
  console.log("Para ver no detalhe, abra o chamado 'QA · chamado com todos os campos'.");
  console.log("------------------------------------------------\n");
}

run();
