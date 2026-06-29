/**
 * Seed de demonstração — popula dados para testar TODOS os perfis de ponta a ponta.
 * Idempotente: pode rodar várias vezes sem duplicar.
 *
 *   node scripts/seed-demo.cjs
 *
 * Cria/garante: 1 técnico, 1 usuário final, 1 máquina (com telemetria de alerta),
 * 1 artigo de base de conhecimento e 1 chamado. Define senhas conhecidas.
 */
const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const { getDb, makeId } = require("nexus-desk-db");

// sha256 hex — mesmo algoritmo de src/lib/security.js · hashToken.
function sha256Hex(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

// Mascara o segredo para exibição — mesmo formato de lib-db · maskSecretPrefix.
function maskSecretPrefix(value) {
  const v = String(value || "");
  if (v.length <= 12) return `${v.slice(0, 4)}…`;
  return `${v.slice(0, 8)}…${v.slice(-4)}`;
}

const PASSWORDS = {
  admin: "Admin@123",
  tech: "Tecnico@123",
  employee: "Usuario@123",
};

function upsertUser(db, { orgId, branchId, name, email, role, password, assetId }) {
  const now = new Date().toISOString();
  const hash = bcrypt.hashSync(password, 12);
  const existing = db.prepare("SELECT id FROM users WHERE organization_id=? AND email=?").get(orgId, email);
  const id = existing?.id || makeId("usr");
  if (!existing) {
    db.prepare("INSERT INTO users (id, organization_id, branch_id, name, email, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(id, orgId, branchId, name, email, role, now);
  }
  // Colunas adicionadas por migração — atualiza de forma resiliente.
  const set = (sql, ...args) => { try { db.prepare(sql).run(...args, id); } catch { /* coluna ausente */ } };
  set("UPDATE users SET name=?, role=?, branch_id=? WHERE id=?", name, role, branchId);
  set("UPDATE users SET password_hash=? WHERE id=?", hash);
  set("UPDATE users SET active=1 WHERE id=?");
  set("UPDATE users SET password_reset_required=0 WHERE id=?");
  set("UPDATE users SET auth_provider='LOCAL' WHERE id=?");
  if (assetId) set("UPDATE users SET asset_id=? WHERE id=?", assetId);
  db.prepare("INSERT OR IGNORE INTO user_branches (user_id, branch_id, is_primary) VALUES (?, ?, 1)").run(id, branchId);
  return id;
}

function run() {
  const db = getDb();
  const org = db.prepare("SELECT id FROM organizations ORDER BY created_at LIMIT 1").get();
  if (!org) throw new Error("Nenhuma organização encontrada. Rode o app uma vez para semear a base mínima.");
  const orgId = org.id;
  const matrix = db.prepare("SELECT id FROM branches WHERE organization_id=? ORDER BY CASE type WHEN 'MATRIZ' THEN 0 ELSE 1 END LIMIT 1").get(orgId);
  const branchId = matrix.id;
  const now = new Date().toISOString();

  // 1) Máquina do usuário com telemetria que dispara alerta (disco 97%).
  const hostname = "NB-DEMO-001";
  let asset = db.prepare("SELECT id FROM assets WHERE organization_id=? AND hostname=?").get(orgId, hostname);
  const assetId = asset?.id || makeId("ast");
  if (!asset) {
    // Token de demo armazenado apenas como hash + prefixo (coerente com a autenticação por hash).
    const demoToken = `demo-token-${makeId("tok")}`;
    db.prepare(`INSERT INTO assets
      (id, organization_id, branch_id, hostname, asset_type, os_name, ip_address, logged_user, status,
       cpu_percent, memory_percent, disk_percent, last_seen_at, agent_token, agent_token_hash, agent_token_prefix, created_at)
      VALUES (?, ?, ?, ?, 'NOTEBOOK', 'Windows 11 Pro', '10.0.0.42', 'usuario.demo', 'ALERT', 35, 58, 97, ?, NULL, ?, ?, ?)`)
      .run(assetId, orgId, branchId, hostname, now, sha256Hex(demoToken), maskSecretPrefix(demoToken), now);
  } else {
    db.prepare("UPDATE assets SET status='ALERT', cpu_percent=35, memory_percent=58, disk_percent=97, last_seen_at=? WHERE id=?").run(now, assetId);
  }

  // 2) Usuários (admin + técnico + usuário final) com credenciais previsíveis para teste.
  const adminId = upsertUser(db, { orgId, branchId, name: "Administrador Demo", email: "admin@local", role: "ADMIN", password: PASSWORDS.admin });
  const adminUser = { id: adminId };
  const techId = upsertUser(db, { orgId, branchId, name: "Técnico Demo", email: "tecnico@local", role: "TECHNICIAN", password: PASSWORDS.tech });
  const employeeId = upsertUser(db, { orgId, branchId, name: "Usuário Demo", email: "usuario@local", role: "EMPLOYEE", password: PASSWORDS.employee, assetId });

  // 3) Artigo de base de conhecimento (visível ao usuário final).
  const kbTitle = "Como liberar espaço no computador";
  if (!db.prepare("SELECT id FROM knowledge_articles WHERE organization_id=? AND title=?").get(orgId, kbTitle)) {
    db.prepare(`INSERT INTO knowledge_articles (id, organization_id, branch_id, title, category, content, created_by, updated_at, created_at)
      VALUES (?, ?, NULL, ?, 'Manutenção', ?, ?, ?, ?)`)
      .run(makeId("kb"), orgId, kbTitle,
        "<p>Quando o computador avisar que está sem espaço, esvazie a Lixeira e remova arquivos antigos da pasta Downloads. Se o aviso continuar, abra um chamado para o suporte fazer uma limpeza completa.</p>",
        adminUser?.id || null, now, now);
  }

  // 4) Chamado de exemplo aberto pelo usuário final.
  if (!db.prepare("SELECT id FROM tickets WHERE organization_id=? AND requester_id=? LIMIT 1").get(orgId, employeeId)) {
    const number = (db.prepare("SELECT COALESCE(MAX(number), 1000)+1 AS n FROM tickets").get().n);
    const ticketId = makeId("tkt");
    db.prepare(`INSERT INTO tickets
      (id, number, organization_id, branch_id, asset_id, requester_id, title, description, category, kind, priority, status, source, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Suporte', 'INCIDENTE', 'MEDIA', 'ABERTO', 'PORTAL', ?, ?)`)
      .run(ticketId, number, orgId, branchId, assetId, employeeId,
        "Computador lento e sem espaço", "<p>Meu computador está travando e aparece aviso de pouco espaço.</p>", now, now);
    db.prepare("INSERT INTO ticket_events VALUES (?, ?, ?, ?, 'CREATED', ?, ?)")
      .run(makeId("evt"), ticketId, employeeId, "Usuário Demo", "Chamado aberto pelo portal.", now);
  }

  console.log("\n✅ Seed de demonstração concluído.");
  console.log("------------------------------------------------");
  console.log("Acesse http://localhost:3000 e faça login:");
  console.log(`  ADMIN     → admin@local      / ${PASSWORDS.admin}`);
  console.log(`  TÉCNICO   → tecnico@local    / ${PASSWORDS.tech}`);
  console.log(`  USUÁRIO   → usuario@local    / ${PASSWORDS.employee}`);
  console.log("------------------------------------------------\n");
}

run();
