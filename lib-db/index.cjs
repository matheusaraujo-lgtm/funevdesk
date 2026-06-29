const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const { createPgDatabase } = require("./pg-adapter.cjs");

const globalForDb = globalThis;

function makeId(prefix) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

// Dados de DEMONSTRAÇÃO (alertas XDR fake, equipes/serviços/macros de exemplo) só são
// semeados quando NEXUS_SEED_DEMO=true. Em produção o sistema nasce limpo: apenas
// organização, filial Matriz, usuário admin e os catálogos essenciais (tipos de
// chamado, status, perfis/permissões). Evita "Ransomware detectado" fake sem agente.
function demoSeedEnabled() {
  return process.env.NEXUS_SEED_DEMO === "true";
}

function initialize(db) {
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL, slug TEXT
    );
    CREATE TABLE IF NOT EXISTS system_settings (
      organization_id TEXT PRIMARY KEY, sla_hours INTEGER NOT NULL DEFAULT 8,
      remote_access_enabled INTEGER NOT NULL DEFAULT 1,
      automatic_tickets_enabled INTEGER NOT NULL DEFAULT 1,
      app_name TEXT NOT NULL DEFAULT 'FunevDesk',
      logo_url TEXT,
      primary_color TEXT NOT NULL DEFAULT '#102033',
      secondary_color TEXT NOT NULL DEFAULT '#bff2e6',
      navigation_mode TEXT NOT NULL DEFAULT 'NAVBAR',
      updated_at TEXT NOT NULL,
      FOREIGN KEY (organization_id) REFERENCES organizations(id)
    );
    CREATE TABLE IF NOT EXISTS branches (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, name TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE, type TEXT NOT NULL CHECK(type IN ('MATRIZ','FILIAL')),
      city TEXT, state TEXT, created_at TEXT NOT NULL,
      FOREIGN KEY (organization_id) REFERENCES organizations(id)
    );
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, branch_id TEXT,
      name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, role TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (organization_id) REFERENCES organizations(id),
      FOREIGN KEY (branch_id) REFERENCES branches(id)
    );
    CREATE TABLE IF NOT EXISTS user_branches (
      user_id TEXT NOT NULL, branch_id TEXT NOT NULL, is_primary INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, branch_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS user_sessions (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL, created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, branch_id TEXT NOT NULL,
      hostname TEXT NOT NULL, asset_type TEXT NOT NULL, os_name TEXT,
      ip_address TEXT, logged_user TEXT, status TEXT NOT NULL DEFAULT 'OFFLINE',
      cpu_percent REAL DEFAULT 0, memory_percent REAL DEFAULT 0,
      disk_percent REAL DEFAULT 0, last_seen_at TEXT, agent_token TEXT UNIQUE,
      mesh_node_id TEXT, agent_domain TEXT, serial_number TEXT, machine_uuid TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (organization_id) REFERENCES organizations(id),
      FOREIGN KEY (branch_id) REFERENCES branches(id)
    );
    CREATE TABLE IF NOT EXISTS asset_inventory (
      asset_id TEXT PRIMARY KEY,
      manufacturer TEXT, model TEXT, bios_version TEXT,
      processor_name TEXT, cpu_cores INTEGER, cpu_logical_processors INTEGER,
      memory_total_gb REAL, disk_total_gb REAL, disk_free_gb REAL,
      mac_addresses_json TEXT, network_adapters_json TEXT,
      antivirus_json TEXT, local_admins_json TEXT, installed_software_json TEXT,
      raw_json TEXT, collected_at TEXT NOT NULL,
      FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS remote_sessions (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, asset_id TEXT NOT NULL,
      requested_by TEXT, requested_by_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'REQUESTED',
      provider TEXT NOT NULL DEFAULT 'NEXUS_WEBRTC',
      provider_node_id TEXT, launch_url TEXT, consent_required INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL, expires_at TEXT,
      FOREIGN KEY (organization_id) REFERENCES organizations(id),
      FOREIGN KEY (asset_id) REFERENCES assets(id),
      FOREIGN KEY (requested_by) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY, number INTEGER NOT NULL UNIQUE, organization_id TEXT NOT NULL,
      branch_id TEXT NOT NULL, asset_id TEXT, requester_id TEXT,
      title TEXT NOT NULL, description TEXT NOT NULL, category TEXT NOT NULL,
      kind TEXT NOT NULL, priority TEXT NOT NULL, status TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'PORTAL', created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      FOREIGN KEY (organization_id) REFERENCES organizations(id),
      FOREIGN KEY (branch_id) REFERENCES branches(id),
      FOREIGN KEY (asset_id) REFERENCES assets(id),
      FOREIGN KEY (requester_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS ticket_events (
      id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL, actor_id TEXT,
      actor_name TEXT NOT NULL, event_type TEXT NOT NULL,
      description TEXT NOT NULL, created_at TEXT NOT NULL,
      FOREIGN KEY (ticket_id) REFERENCES tickets(id)
    );
    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY, asset_id TEXT NOT NULL, branch_id TEXT NOT NULL,
      alert_type TEXT NOT NULL, severity TEXT NOT NULL, message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'OPEN', ticket_id TEXT, created_at TEXT NOT NULL,
      FOREIGN KEY (asset_id) REFERENCES assets(id),
      FOREIGN KEY (branch_id) REFERENCES branches(id),
      FOREIGN KEY (ticket_id) REFERENCES tickets(id)
    );
    CREATE TABLE IF NOT EXISTS ticket_types (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, name TEXT NOT NULL,
      description TEXT, kind TEXT NOT NULL, category TEXT NOT NULL,
      default_priority TEXT NOT NULL DEFAULT 'MEDIA', active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      FOREIGN KEY (organization_id) REFERENCES organizations(id)
    );
    CREATE TABLE IF NOT EXISTS ticket_fields (
      id TEXT PRIMARY KEY, ticket_type_id TEXT NOT NULL, label TEXT NOT NULL,
      field_type TEXT NOT NULL, placeholder TEXT, required INTEGER NOT NULL DEFAULT 0,
      options_json TEXT, position INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (ticket_type_id) REFERENCES ticket_types(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS ticket_responses (
      id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL, field_id TEXT,
      field_label TEXT NOT NULL, field_type TEXT NOT NULL, value_text TEXT,
      FOREIGN KEY (ticket_id) REFERENCES tickets(id),
      FOREIGN KEY (field_id) REFERENCES ticket_fields(id)
    );
    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY, ticket_id TEXT, original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL, mime_type TEXT NOT NULL, size_bytes INTEGER NOT NULL,
      public_url TEXT NOT NULL, attachment_type TEXT NOT NULL, created_at TEXT NOT NULL,
      FOREIGN KEY (ticket_id) REFERENCES tickets(id)
    );
    CREATE TABLE IF NOT EXISTS knowledge_articles (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, branch_id TEXT,
      title TEXT NOT NULL, category TEXT NOT NULL, content TEXT NOT NULL,
      created_by TEXT, updated_at TEXT NOT NULL, created_at TEXT NOT NULL,
      FOREIGN KEY (organization_id) REFERENCES organizations(id),
      FOREIGN KEY (branch_id) REFERENCES branches(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS it_documents (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, branch_id TEXT NOT NULL,
      title TEXT NOT NULL, document_type TEXT NOT NULL, content TEXT NOT NULL,
      updated_at TEXT NOT NULL, created_at TEXT NOT NULL,
      FOREIGN KEY (organization_id) REFERENCES organizations(id),
      FOREIGN KEY (branch_id) REFERENCES branches(id)
    );
    CREATE TABLE IF NOT EXISTS equipment_terms (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, branch_id TEXT NOT NULL,
      asset_id TEXT NOT NULL, user_id TEXT,
      signer_name TEXT NOT NULL, signer_document TEXT, signature_text TEXT,
      pdf_name TEXT NOT NULL, pdf_url TEXT NOT NULL, created_at TEXT NOT NULL,
      FOREIGN KEY (organization_id) REFERENCES organizations(id),
      FOREIGN KEY (branch_id) REFERENCES branches(id),
      FOREIGN KEY (asset_id) REFERENCES assets(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS ticket_approvals (
      id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL, approver_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDENTE', requested_at TEXT NOT NULL,
      decided_at TEXT, comment TEXT,
      FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
      FOREIGN KEY (approver_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS network_devices (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, branch_id TEXT NOT NULL,
      name TEXT NOT NULL, device_type TEXT NOT NULL, ip_address TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'DESCONHECIDO', latency_ms INTEGER,
      last_seen_at TEXT, notes TEXT, created_at TEXT NOT NULL,
      monitor_type TEXT NOT NULL DEFAULT 'PING', vendor TEXT,
      check_ports_json TEXT, snmp_community TEXT, smb_share TEXT,
      metrics_json TEXT, last_error TEXT,
      FOREIGN KEY (organization_id) REFERENCES organizations(id),
      FOREIGN KEY (branch_id) REFERENCES branches(id)
    );
  `);

  const count = db.prepare("SELECT COUNT(*) AS total FROM organizations").get().total;
  const userColumns = db.prepare("PRAGMA table_info(users)").all();
  if (!userColumns.some((column) => column.name === "asset_id")) {
    db.exec("ALTER TABLE users ADD COLUMN asset_id TEXT REFERENCES assets(id)");
  }
  if (!userColumns.some((column) => column.name === "active")) {
    db.exec("ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1");
  }
  if (!userColumns.some((column) => column.name === "password_hash")) {
    db.exec("ALTER TABLE users ADD COLUMN password_hash TEXT");
  }
  if (!userColumns.some((column) => column.name === "password_reset_required")) {
    db.exec("ALTER TABLE users ADD COLUMN password_reset_required INTEGER NOT NULL DEFAULT 0");
  }
  const ticketColumns = db.prepare("PRAGMA table_info(tickets)").all();
  if (!ticketColumns.some((column) => column.name === "ticket_type_id")) {
    db.exec("ALTER TABLE tickets ADD COLUMN ticket_type_id TEXT REFERENCES ticket_types(id)");
  }
  ensureAssetColumns(db);
  ensureFeatureTables(db);
  if (count) {
    ensureTicketCatalog(db);
    ensureSystemSettings(db);
    return;
  }

  const now = new Date().toISOString();
  const orgId = makeId("org");
  const matrixId = makeId("br");
  const filial1 = makeId("br");
  const filial2 = makeId("br");
  const adminId = makeId("usr");
  const minimalSeed = db.transaction(() => {
    db.prepare("INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)").run(orgId, "Minha Empresa", now);
    db.prepare("UPDATE organizations SET slug='minha-empresa' WHERE id=?").run(orgId);
    db.prepare("INSERT INTO branches VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(matrixId, orgId, "Matriz", "MATRIZ", "MATRIZ", null, null, now);
    db.prepare("INSERT INTO users (id, organization_id, branch_id, name, email, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(adminId, orgId, matrixId, "Administrador", "admin@local", "ADMIN", now);
  });
  minimalSeed();
  ensureTicketCatalog(db);
  ensureSystemSettings(db);
  ensureFeatureTables(db);
  return;
  const requesterId = makeId("usr");

  const seed = db.transaction(() => {
    db.prepare("INSERT INTO organizations VALUES (?, ?, ?)").run(orgId, "Grupo Horizonte", now);
    db.prepare("UPDATE organizations SET slug='grupo-horizonte' WHERE id=?").run(orgId);
    const insertBranch = db.prepare("INSERT INTO branches VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    insertBranch.run(matrixId, orgId, "Matriz São Paulo", "MATRIZ-SP", "MATRIZ", "São Paulo", "SP", now);
    insertBranch.run(filial1, orgId, "Filial Campinas", "FILIAL-CPS", "FILIAL", "Campinas", "SP", now);
    insertBranch.run(filial2, orgId, "Filial Curitiba", "FILIAL-CWB", "FILIAL", "Curitiba", "PR", now);
    const insertUser = db.prepare("INSERT INTO users (id, organization_id, branch_id, name, email, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
    insertUser.run(adminId, orgId, matrixId, "Marina Oliveira", "marina@horizonte.local", "ADMIN", now);
    insertUser.run(requesterId, orgId, filial1, "Carlos Mendes", "carlos@horizonte.local", "EMPLOYEE", now);

    const insertAsset = db.prepare(`INSERT INTO assets
      (id, organization_id, branch_id, hostname, asset_type, os_name, ip_address, logged_user, status, cpu_percent, memory_percent, disk_percent, last_seen_at, agent_token, mesh_node_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const assets = [
      [makeId("ast"), matrixId, "SRV-ERP-01", "SERVIDOR", "Windows Server 2022", "10.0.1.10", "SYSTEM", "ALERT", 94, 68, 72, "demo-matrix-server"],
      [makeId("ast"), matrixId, "SRV-FILES-02", "SERVIDOR", "Ubuntu Server 24.04", "10.0.1.12", "root", "ONLINE", 31, 54, 86, "demo-files"],
      [makeId("ast"), filial1, "NB-FIN-023", "NOTEBOOK", "Windows 11 Pro", "10.20.10.43", "carlos.mendes", "ONLINE", 22, 61, 44, "demo-agent-cps"],
      [makeId("ast"), filial1, "FW-FILIAL-03", "REDE", "RouterOS", "172.16.3.1", "admin", "ALERT", 18, 35, 20, "demo-firewall"],
      [makeId("ast"), filial2, "NB-RH-011", "NOTEBOOK", "Windows 11 Pro", "10.30.11.22", "ana.luiza", "OFFLINE", 0, 0, 0, "demo-agent-cwb"]
    ];
    for (const [id, branch, host, type, os, ip, user, status, cpu, mem, disk, token] of assets) {
      insertAsset.run(id, orgId, branch, host, type, os, ip, user, status, cpu, mem, disk, status === "OFFLINE" ? null : now, token, null, now);
    }
    db.prepare("UPDATE users SET asset_id=? WHERE id=?").run(assets[2][0], requesterId);

    const ticketAsset = assets[2][0];
    const insertTicket = db.prepare(`INSERT INTO tickets
      (id, number, organization_id, branch_id, asset_id, requester_id, title, description, category, kind, priority, status, source, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const t1 = makeId("tkt");
    const t2 = makeId("tkt");
    const t3 = makeId("tkt");
    insertTicket.run(t1, 1048, orgId, filial1, ticketAsset, requesterId, "ERP não inicia no setor financeiro", "O ERP fecha após a tela de login.", "Sistema", "INCIDENTE", "ALTA", "EM_ATENDIMENTO", "AGENT", now, now);
    insertTicket.run(t2, 1047, orgId, matrixId, null, adminId, "Solicitação de acesso ao Power BI", "Liberar workspace comercial.", "Acesso", "REQUISICAO", "MEDIA", "ABERTO", "PORTAL", now, now);
    insertTicket.run(t3, 1046, orgId, filial2, assets[4][0], null, "Notebook da recepção sem conexão", "Agente está offline.", "Rede", "INCIDENTE", "ALTA", "ABERTO", "MONITOR", now, now);
    db.prepare("INSERT INTO ticket_events VALUES (?, ?, ?, ?, 'CREATED', ?, ?)")
      .run(makeId("evt"), t1, requesterId, "Carlos Mendes", "Chamado criado pelo agente da máquina.", now);
  });
  seed();
  ensureAccessDemo(db);
  ensureTicketCatalog(db);
  ensureSystemSettings(db);
  ensureFeatureTables(db);
}

function ensureSystemSettings(db) {
  const organization = db.prepare("SELECT id FROM organizations LIMIT 1").get();
  if (!organization) return;
  const columns = db.prepare("PRAGMA table_info(system_settings)").all();
  if (!columns.some((column) => column.name === "app_name")) {
    db.exec("ALTER TABLE system_settings ADD COLUMN app_name TEXT NOT NULL DEFAULT 'FunevDesk'");
  }
  if (!columns.some((column) => column.name === "logo_url")) {
    db.exec("ALTER TABLE system_settings ADD COLUMN logo_url TEXT");
  }
  if (!columns.some((column) => column.name === "primary_color")) {
    db.exec("ALTER TABLE system_settings ADD COLUMN primary_color TEXT NOT NULL DEFAULT '#102033'");
  }
  if (!columns.some((column) => column.name === "secondary_color")) {
    db.exec("ALTER TABLE system_settings ADD COLUMN secondary_color TEXT NOT NULL DEFAULT '#bff2e6'");
  }
  if (!columns.some((column) => column.name === "navigation_mode")) {
    db.exec("ALTER TABLE system_settings ADD COLUMN navigation_mode TEXT NOT NULL DEFAULT 'NAVBAR'");
  }
  db.prepare(`INSERT OR IGNORE INTO system_settings
    (organization_id, sla_hours, remote_access_enabled, automatic_tickets_enabled, app_name, primary_color, secondary_color, navigation_mode, updated_at)
    VALUES (?, 8, 1, 1, 'FunevDesk', '#102033', '#bff2e6', 'NAVBAR', ?)`).run(organization.id, new Date().toISOString());
}

function ensureRuntimeMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS system_settings (
      organization_id TEXT PRIMARY KEY, sla_hours INTEGER NOT NULL DEFAULT 8,
      remote_access_enabled INTEGER NOT NULL DEFAULT 1,
      automatic_tickets_enabled INTEGER NOT NULL DEFAULT 1,
      app_name TEXT NOT NULL DEFAULT 'FunevDesk',
      logo_url TEXT,
      primary_color TEXT NOT NULL DEFAULT '#102033',
      secondary_color TEXT NOT NULL DEFAULT '#bff2e6',
      navigation_mode TEXT NOT NULL DEFAULT 'NAVBAR',
      updated_at TEXT NOT NULL,
      FOREIGN KEY (organization_id) REFERENCES organizations(id)
    );
    CREATE TABLE IF NOT EXISTS ticket_events (
      id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL, actor_id TEXT,
      actor_name TEXT NOT NULL, event_type TEXT NOT NULL,
      description TEXT NOT NULL, created_at TEXT NOT NULL,
      FOREIGN KEY (ticket_id) REFERENCES tickets(id)
    );
    CREATE TABLE IF NOT EXISTS user_branches (
      user_id TEXT NOT NULL, branch_id TEXT NOT NULL, is_primary INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, branch_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS user_sessions (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL, created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
  const userColumns = db.prepare("PRAGMA table_info(users)").all();
  if (!userColumns.some((column) => column.name === "active")) {
    db.exec("ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1");
  }
  if (!userColumns.some((column) => column.name === "password_hash")) {
    db.exec("ALTER TABLE users ADD COLUMN password_hash TEXT");
  }
  if (!userColumns.some((column) => column.name === "password_reset_required")) {
    db.exec("ALTER TABLE users ADD COLUMN password_reset_required INTEGER NOT NULL DEFAULT 0");
  }
  db.prepare(`INSERT OR IGNORE INTO user_branches (user_id, branch_id, is_primary)
    SELECT id, branch_id, 1 FROM users WHERE branch_id IS NOT NULL`).run();
  const usersWithoutPassword = db.prepare("SELECT COUNT(*) total FROM users WHERE password_hash IS NULL").get().total;
  if (usersWithoutPassword) {
    // Sem senha padrão hardcoded. Usa NEXUS_SEED_PASSWORD se definida; senão gera
    // uma senha aleatória forte e a exibe UMA vez no console. Troca obrigatória no 1º login.
    const seedPassword = process.env.NEXUS_SEED_PASSWORD || crypto.randomBytes(12).toString("base64url");
    const initialHash = bcrypt.hashSync(seedPassword, 12);
    db.prepare("UPDATE users SET password_hash=?, password_reset_required=1 WHERE password_hash IS NULL").run(initialHash);
    if (!process.env.NEXUS_SEED_PASSWORD) {
      console.warn("\n========================================================");
      console.warn(`[FunevDesk] Senha inicial gerada para ${usersWithoutPassword} usuário(s) sem senha:`);
      console.warn(`             ${seedPassword}`);
      console.warn("             Troca obrigatória no primeiro login. Defina NEXUS_SEED_PASSWORD para fixar.");
      console.warn("========================================================\n");
    }
  }

  // Mitiga instalações que já receberam a antiga senha padrão hardcoded "Nexus@123":
  // rotaciona para uma senha aleatória (exibida uma vez) mantendo troca obrigatória.
  try {
    const resetCandidates = db.prepare("SELECT id, password_hash FROM users WHERE password_reset_required=1 AND password_hash IS NOT NULL").all();
    const legacy = resetCandidates.filter((u) => {
      try { return bcrypt.compareSync("Nexus@123", u.password_hash); } catch { return false; }
    });
    if (legacy.length) {
      const rotated = process.env.NEXUS_SEED_PASSWORD || crypto.randomBytes(12).toString("base64url");
      const hash = bcrypt.hashSync(rotated, 12);
      const upd = db.prepare("UPDATE users SET password_hash=? WHERE id=?");
      for (const u of legacy) upd.run(hash, u.id);
      if (!process.env.NEXUS_SEED_PASSWORD) {
        console.warn("\n========================================================");
        console.warn(`[FunevDesk] Senha padrão antiga ("Nexus@123") detectada e rotacionada em ${legacy.length} conta(s).`);
        console.warn(`             Nova senha temporária: ${rotated}`);
        console.warn("             Troca obrigatória no próximo login.");
        console.warn("========================================================\n");
      }
    }
  } catch { /* ignora se a tabela ainda não existir */ }
  db.prepare("DELETE FROM user_sessions WHERE expires_at <= ?").run(new Date().toISOString());
  ensureAssetColumns(db);
  ensureFeatureTables(db);
  ensureItilTables(db);
  ensureSystemSettings(db);
}

function ensureAssetColumns(db) {
  const assetColumns = db.prepare("PRAGMA table_info(assets)").all();
  if (!assetColumns.some((column) => column.name === "equipment_type")) {
    db.exec("ALTER TABLE assets ADD COLUMN equipment_type TEXT");
  }
  if (!assetColumns.some((column) => column.name === "patrimony_number")) {
    db.exec("ALTER TABLE assets ADD COLUMN patrimony_number TEXT");
  }
  if (!assetColumns.some((column) => column.name === "agent_domain")) {
    db.exec("ALTER TABLE assets ADD COLUMN agent_domain TEXT");
  }
  if (!assetColumns.some((column) => column.name === "serial_number")) {
    db.exec("ALTER TABLE assets ADD COLUMN serial_number TEXT");
  }
  if (!assetColumns.some((column) => column.name === "machine_uuid")) {
    db.exec("ALTER TABLE assets ADD COLUMN machine_uuid TEXT");
  }
  if (!assetColumns.some((column) => column.name === "active")) {
    db.exec("ALTER TABLE assets ADD COLUMN active INTEGER NOT NULL DEFAULT 1");
  }
  if (!assetColumns.some((column) => column.name === "agent_version")) {
    db.exec("ALTER TABLE assets ADD COLUMN agent_version TEXT");
  }
  // Tokens de agente hasheados em repouso (sha256). Prefixo mascarado só para identificação na UI.
  if (!assetColumns.some((column) => column.name === "agent_token_hash")) {
    db.exec("ALTER TABLE assets ADD COLUMN agent_token_hash TEXT");
  }
  if (!assetColumns.some((column) => column.name === "agent_token_prefix")) {
    db.exec("ALTER TABLE assets ADD COLUMN agent_token_prefix TEXT");
  }
  // Garante que cada hash de token de agente resolve para NO MÁXIMO um ativo (segurança da
  // autenticação do agente). Índice parcial: ignora os NULL (ativos ainda sem token).
  try {
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_assets_agent_token_hash ON assets(agent_token_hash) WHERE agent_token_hash IS NOT NULL");
  } catch {
    // Base legada com hash duplicado: não bloqueia a inicialização. A geração aleatória de
    // 24 bytes torna colisão improvável; o índice pode ser recriado após limpeza manual.
  }
  db.prepare("UPDATE assets SET equipment_type=COALESCE(equipment_type, asset_type) WHERE equipment_type IS NULL").run();
}

// Hash sha256 (mesmo algoritmo de src/lib/security.js hashToken) — usado nas migrações de segredos.
function sha256Hex(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function maskSecretPrefix(value) {
  const v = String(value || "");
  if (v.length <= 12) return v.slice(0, 4) + "…";
  return `${v.slice(0, 8)}…${v.slice(-4)}`;
}

// Migra tokens de agente e chave de enrollment para hash em repouso, removendo o texto puro.
// Idempotente: só age sobre linhas que ainda têm o segredo em claro.
function migrateSecretsAtRest(db) {
  try {
    const assets = db.prepare("SELECT id, agent_token FROM assets WHERE agent_token IS NOT NULL AND agent_token <> ''").all();
    const updateAsset = db.prepare("UPDATE assets SET agent_token_hash=?, agent_token_prefix=?, agent_token=NULL WHERE id=?");
    for (const a of assets) {
      updateAsset.run(sha256Hex(a.agent_token), maskSecretPrefix(a.agent_token), a.id);
    }
  } catch { /* coluna ainda não existe em paths iniciais */ }
  try {
    const settings = db.prepare("SELECT organization_id, agent_enrollment_key FROM system_settings WHERE agent_enrollment_key IS NOT NULL AND agent_enrollment_key <> ''").all();
    const updateSettings = db.prepare("UPDATE system_settings SET agent_enrollment_key_hash=?, agent_enrollment_key_prefix=?, agent_enrollment_key=NULL WHERE organization_id=?");
    for (const s of settings) {
      updateSettings.run(sha256Hex(s.agent_enrollment_key), maskSecretPrefix(s.agent_enrollment_key), s.organization_id);
    }
  } catch { /* coluna ainda não existe */ }
}

function ensureNetworkDeviceColumns(db) {
  const columns = db.prepare("PRAGMA table_info(network_devices)").all();
  const addColumn = (name, ddl) => {
    if (!columns.some((column) => column.name === name)) db.exec(`ALTER TABLE network_devices ADD COLUMN ${ddl}`);
  };
  addColumn("monitor_type", "monitor_type TEXT NOT NULL DEFAULT 'PING'");
  addColumn("vendor", "vendor TEXT");
  addColumn("check_ports_json", "check_ports_json TEXT");
  addColumn("snmp_community", "snmp_community TEXT");
  addColumn("smb_share", "smb_share TEXT");
  addColumn("metrics_json", "metrics_json TEXT");
  addColumn("last_error", "last_error TEXT");
  addColumn("snmp_version", "snmp_version TEXT NOT NULL DEFAULT 'v1'");
  // Abertura automática de chamado por monitoramento (ex.: toner baixo, erro/offline).
  addColumn("auto_ticket", "auto_ticket INTEGER NOT NULL DEFAULT 0");
  addColumn("auto_ticket_toner", "auto_ticket_toner INTEGER");
  addColumn("auto_ticket_on_error", "auto_ticket_on_error INTEGER NOT NULL DEFAULT 0");
  addColumn("auto_ticket_id", "auto_ticket_id TEXT");
}

function ensureFeatureTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_articles (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, branch_id TEXT,
      title TEXT NOT NULL, category TEXT NOT NULL, content TEXT NOT NULL,
      created_by TEXT, updated_at TEXT NOT NULL, created_at TEXT NOT NULL,
      FOREIGN KEY (organization_id) REFERENCES organizations(id),
      FOREIGN KEY (branch_id) REFERENCES branches(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS it_documents (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, branch_id TEXT NOT NULL,
      title TEXT NOT NULL, document_type TEXT NOT NULL, content TEXT NOT NULL,
      updated_at TEXT NOT NULL, created_at TEXT NOT NULL,
      FOREIGN KEY (organization_id) REFERENCES organizations(id),
      FOREIGN KEY (branch_id) REFERENCES branches(id)
    );
    CREATE TABLE IF NOT EXISTS equipment_terms (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, branch_id TEXT NOT NULL,
      asset_id TEXT NOT NULL, user_id TEXT,
      signer_name TEXT NOT NULL, signer_document TEXT, signature_text TEXT,
      pdf_name TEXT NOT NULL, pdf_url TEXT NOT NULL, created_at TEXT NOT NULL,
      FOREIGN KEY (organization_id) REFERENCES organizations(id),
      FOREIGN KEY (branch_id) REFERENCES branches(id),
      FOREIGN KEY (asset_id) REFERENCES assets(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS ticket_approvals (
      id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL, approver_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDENTE', requested_at TEXT NOT NULL,
      decided_at TEXT, comment TEXT,
      FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
      FOREIGN KEY (approver_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS network_devices (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, branch_id TEXT NOT NULL,
      name TEXT NOT NULL, device_type TEXT NOT NULL, ip_address TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'DESCONHECIDO', latency_ms INTEGER,
      last_seen_at TEXT, notes TEXT, created_at TEXT NOT NULL,
      monitor_type TEXT NOT NULL DEFAULT 'PING', vendor TEXT,
      check_ports_json TEXT, snmp_community TEXT, smb_share TEXT,
      metrics_json TEXT, last_error TEXT,
      FOREIGN KEY (organization_id) REFERENCES organizations(id),
      FOREIGN KEY (branch_id) REFERENCES branches(id)
    );
    CREATE TABLE IF NOT EXISTS resolution_macros (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL,
      title TEXT NOT NULL, body TEXT NOT NULL,
      created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      FOREIGN KEY (organization_id) REFERENCES organizations(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS saved_views (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, user_id TEXT NOT NULL,
      name TEXT NOT NULL, filters_json TEXT NOT NULL, created_at TEXT NOT NULL,
      FOREIGN KEY (organization_id) REFERENCES organizations(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS agent_commands (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, asset_id TEXT NOT NULL,
      command TEXT NOT NULL, params_json TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING', result TEXT,
      created_by TEXT, created_by_name TEXT, alert_id TEXT,
      created_at TEXT NOT NULL, completed_at TEXT,
      FOREIGN KEY (organization_id) REFERENCES organizations(id),
      FOREIGN KEY (asset_id) REFERENCES assets(id)
    );
    CREATE INDEX IF NOT EXISTS idx_agent_commands_asset ON agent_commands(asset_id, status);
  `);
  ensureNetworkDeviceColumns(db);
  if (demoSeedEnabled()) ensureMacroSeeds(db);
}

// Semeia macros de resolução padrão (respostas prontas) na primeira execução.
function ensureMacroSeeds(db) {
  const orgs = db.prepare("SELECT id FROM organizations").all();
  for (const org of orgs) {
    const has = db.prepare("SELECT COUNT(*) AS total FROM resolution_macros WHERE organization_id=?").get(org.id).total;
    if (has) continue;
    const now = new Date().toISOString();
    const seeds = [
      { title: "Resolvido — reinício", body: "Realizamos o reinício do equipamento/serviço e o problema foi normalizado. Qualquer nova ocorrência, é só reabrir o chamado." },
      { title: "Resolvido — atualização", body: "Aplicamos a atualização necessária e validamos o funcionamento. O chamado está resolvido; obrigado pelo contato." },
      { title: "Resolvido — orientação ao usuário", body: "Orientamos sobre o procedimento correto e o usuário confirmou que está tudo funcionando. Seguimos à disposição." },
      { title: "Sem retorno do solicitante", body: "Tentamos contato para dar andamento, mas não obtivemos retorno. Estamos encerrando o chamado; reabra quando precisar." },
    ];
    const insert = db.prepare("INSERT INTO resolution_macros (id, organization_id, title, body, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, ?, ?)");
    for (const seed of seeds) insert.run(makeId("macro"), org.id, seed.title, seed.body, now, now);
  }
}

function ensureItilTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, branch_id TEXT,
      name TEXT NOT NULL, description TEXT, created_at TEXT NOT NULL,
      FOREIGN KEY (organization_id) REFERENCES organizations(id),
      FOREIGN KEY (branch_id) REFERENCES branches(id)
    );
    CREATE TABLE IF NOT EXISTS team_members (
      team_id TEXT NOT NULL, user_id TEXT NOT NULL,
      PRIMARY KEY (team_id, user_id),
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS services (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, ticket_type_id TEXT,
      name TEXT NOT NULL, description TEXT, sla_hours INTEGER,
      requires_approval INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      FOREIGN KEY (organization_id) REFERENCES organizations(id),
      FOREIGN KEY (ticket_type_id) REFERENCES ticket_types(id)
    );
    CREATE TABLE IF NOT EXISTS problems (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, number INTEGER NOT NULL,
      title TEXT NOT NULL, description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ABERTO',
      root_cause TEXT, workaround TEXT, assignee_id TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      FOREIGN KEY (organization_id) REFERENCES organizations(id),
      FOREIGN KEY (assignee_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS changes (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, number INTEGER NOT NULL,
      title TEXT NOT NULL, description TEXT NOT NULL,
      change_type TEXT NOT NULL DEFAULT 'NORMAL',
      status TEXT NOT NULL DEFAULT 'SOLICITADO',
      risk TEXT NOT NULL DEFAULT 'MEDIO',
      planned_start TEXT, planned_end TEXT, assignee_id TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      FOREIGN KEY (organization_id) REFERENCES organizations(id),
      FOREIGN KEY (assignee_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS change_approvals (
      id TEXT PRIMARY KEY, change_id TEXT NOT NULL, approver_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDENTE', requested_at TEXT NOT NULL,
      decided_at TEXT, comment TEXT,
      FOREIGN KEY (change_id) REFERENCES changes(id) ON DELETE CASCADE,
      FOREIGN KEY (approver_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS asset_relationships (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL,
      source_asset_id TEXT NOT NULL, target_asset_id TEXT NOT NULL,
      relationship_type TEXT NOT NULL DEFAULT 'DEPENDS_ON',
      created_at TEXT NOT NULL,
      FOREIGN KEY (organization_id) REFERENCES organizations(id),
      FOREIGN KEY (source_asset_id) REFERENCES assets(id) ON DELETE CASCADE,
      FOREIGN KEY (target_asset_id) REFERENCES assets(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS asset_inventory (
      asset_id TEXT PRIMARY KEY,
      manufacturer TEXT, model TEXT, bios_version TEXT,
      processor_name TEXT, cpu_cores INTEGER, cpu_logical_processors INTEGER,
      memory_total_gb REAL, disk_total_gb REAL, disk_free_gb REAL,
      mac_addresses_json TEXT, network_adapters_json TEXT,
      antivirus_json TEXT, local_admins_json TEXT, installed_software_json TEXT,
      raw_json TEXT, collected_at TEXT NOT NULL,
      FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS remote_sessions (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, asset_id TEXT NOT NULL,
      requested_by TEXT, requested_by_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'REQUESTED',
      provider TEXT NOT NULL DEFAULT 'NEXUS_WEBRTC',
      provider_node_id TEXT, launch_url TEXT, consent_required INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL, expires_at TEXT,
      FOREIGN KEY (organization_id) REFERENCES organizations(id),
      FOREIGN KEY (asset_id) REFERENCES assets(id),
      FOREIGN KEY (requested_by) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS escalation_rules (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL,
      name TEXT NOT NULL, trigger_type TEXT NOT NULL,
      wait_minutes INTEGER NOT NULL DEFAULT 60,
      priority TEXT, team_id TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (organization_id) REFERENCES organizations(id),
      FOREIGN KEY (team_id) REFERENCES teams(id)
    );
    CREATE TABLE IF NOT EXISTS webhooks (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL,
      name TEXT NOT NULL, url TEXT NOT NULL, events_json TEXT NOT NULL,
      secret TEXT, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL,
      FOREIGN KEY (organization_id) REFERENCES organizations(id)
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL,
      actor_id TEXT, actor_name TEXT NOT NULL,
      entity_type TEXT NOT NULL, entity_id TEXT,
      action TEXT NOT NULL, details TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (organization_id) REFERENCES organizations(id)
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, user_id TEXT NOT NULL,
      channel TEXT NOT NULL DEFAULT 'IN_APP', event_type TEXT NOT NULL,
      title TEXT NOT NULL, body TEXT NOT NULL,
      read_at TEXT, created_at TEXT NOT NULL,
      FOREIGN KEY (organization_id) REFERENCES organizations(id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS ticket_messages (
      id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL, author_id TEXT,
      author_name TEXT NOT NULL, body TEXT NOT NULL,
      visibility TEXT NOT NULL DEFAULT 'PUBLIC',
      created_at TEXT NOT NULL,
      FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
      FOREIGN KEY (author_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS automation_rules (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL,
      name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
      position INTEGER NOT NULL DEFAULT 0,
      conditions_json TEXT NOT NULL DEFAULT '{}',
      actions_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      FOREIGN KEY (organization_id) REFERENCES organizations(id)
    );
  `);

  const ticketColumns = db.prepare("PRAGMA table_info(tickets)").all();
  const addTicketCol = (name, ddl) => { if (!ticketColumns.some((c) => c.name === name)) db.exec(`ALTER TABLE tickets ADD COLUMN ${ddl}`); };
  addTicketCol("ticket_type_id", "ticket_type_id TEXT");
  addTicketCol("assignee_id", "assignee_id TEXT");
  addTicketCol("team_id", "team_id TEXT");
  addTicketCol("service_id", "service_id TEXT");
  addTicketCol("problem_id", "problem_id TEXT");
  addTicketCol("sla_due_at", "sla_due_at TEXT");
  addTicketCol("sla_status", "sla_status TEXT");
  addTicketCol("first_response_at", "first_response_at TEXT");
  addTicketCol("resolved_at", "resolved_at TEXT");
  addTicketCol("escalated_at", "escalated_at TEXT");
  addTicketCol("csat_score", "csat_score INTEGER");
  addTicketCol("csat_comment", "csat_comment TEXT");
  addTicketCol("origin_branch_id", "origin_branch_id TEXT");
  addTicketCol("checklist_json", "checklist_json TEXT");
  addTicketCol("first_response_due_at", "first_response_due_at TEXT");
  db.prepare("UPDATE tickets SET origin_branch_id=branch_id WHERE origin_branch_id IS NULL").run();

  const messageColumns = db.prepare("PRAGMA table_info(ticket_messages)").all();
  if (messageColumns.length && !messageColumns.some((column) => column.name === "message_type")) {
    db.exec("ALTER TABLE ticket_messages ADD COLUMN message_type TEXT NOT NULL DEFAULT 'REPLY'");
  }

  const assetColumns = db.prepare("PRAGMA table_info(assets)").all();
  if (!assetColumns.some((c) => c.name === "lifecycle_status")) db.exec("ALTER TABLE assets ADD COLUMN lifecycle_status TEXT DEFAULT 'EM_USO'");
  if (!assetColumns.some((c) => c.name === "warranty_expires_at")) db.exec("ALTER TABLE assets ADD COLUMN warranty_expires_at TEXT");
  if (!assetColumns.some((c) => c.name === "contract_vendor")) db.exec("ALTER TABLE assets ADD COLUMN contract_vendor TEXT");
  if (!assetColumns.some((c) => c.name === "contract_expires_at")) db.exec("ALTER TABLE assets ADD COLUMN contract_expires_at TEXT");

  const notificationColumns = db.prepare("PRAGMA table_info(notifications)").all();
  if (!notificationColumns.some((c) => c.name === "reference_id")) db.exec("ALTER TABLE notifications ADD COLUMN reference_id TEXT");
  if (!notificationColumns.some((c) => c.name === "reference_type")) db.exec("ALTER TABLE notifications ADD COLUMN reference_type TEXT");

  const settingsColumns = db.prepare("PRAGMA table_info(system_settings)").all();
  if (!settingsColumns.some((c) => c.name === "business_hours_json")) db.exec("ALTER TABLE system_settings ADD COLUMN business_hours_json TEXT DEFAULT '{\"start\":\"08:00\",\"end\":\"18:00\",\"days\":[1,2,3,4,5]}'");
  if (!settingsColumns.some((c) => c.name === "notifications_enabled")) db.exec("ALTER TABLE system_settings ADD COLUMN notifications_enabled INTEGER NOT NULL DEFAULT 1");
  if (!settingsColumns.some((c) => c.name === "escalation_enabled")) db.exec("ALTER TABLE system_settings ADD COLUMN escalation_enabled INTEGER NOT NULL DEFAULT 1");
  if (!settingsColumns.some((c) => c.name === "sso_provider")) db.exec("ALTER TABLE system_settings ADD COLUMN sso_provider TEXT DEFAULT 'LOCAL'");
  if (!settingsColumns.some((c) => c.name === "agent_enrollment_key")) db.exec("ALTER TABLE system_settings ADD COLUMN agent_enrollment_key TEXT");
  if (!settingsColumns.some((c) => c.name === "agent_enrollment_key_hash")) db.exec("ALTER TABLE system_settings ADD COLUMN agent_enrollment_key_hash TEXT");
  if (!settingsColumns.some((c) => c.name === "agent_enrollment_key_prefix")) db.exec("ALTER TABLE system_settings ADD COLUMN agent_enrollment_key_prefix TEXT");
  if (!settingsColumns.some((c) => c.name === "mesh_central_url")) db.exec("ALTER TABLE system_settings ADD COLUMN mesh_central_url TEXT");
  if (!settingsColumns.some((c) => c.name === "printer_alert_events")) db.exec("ALTER TABLE system_settings ADD COLUMN printer_alert_events TEXT");
  if (!settingsColumns.some((c) => c.name === "app_name")) db.exec("ALTER TABLE system_settings ADD COLUMN app_name TEXT NOT NULL DEFAULT 'FunevDesk'");
  if (!settingsColumns.some((c) => c.name === "logo_url")) db.exec("ALTER TABLE system_settings ADD COLUMN logo_url TEXT");
  if (!settingsColumns.some((c) => c.name === "primary_color")) db.exec("ALTER TABLE system_settings ADD COLUMN primary_color TEXT NOT NULL DEFAULT '#102033'");
  if (!settingsColumns.some((c) => c.name === "secondary_color")) db.exec("ALTER TABLE system_settings ADD COLUMN secondary_color TEXT NOT NULL DEFAULT '#bff2e6'");
  if (!settingsColumns.some((c) => c.name === "navigation_mode")) db.exec("ALTER TABLE system_settings ADD COLUMN navigation_mode TEXT NOT NULL DEFAULT 'NAVBAR'");
  if (!settingsColumns.some((c) => c.name === "sla_policy_json")) db.exec("ALTER TABLE system_settings ADD COLUMN sla_policy_json TEXT DEFAULT '{\"CRITICA\":{\"firstResponseMinutes\":15,\"resolutionHours\":2},\"ALTA\":{\"firstResponseMinutes\":30,\"resolutionHours\":4},\"MEDIA\":{\"firstResponseMinutes\":60,\"resolutionHours\":8},\"BAIXA\":{\"firstResponseMinutes\":240,\"resolutionHours\":16}}'");

  const remoteColumns = db.prepare("PRAGMA table_info(remote_sessions)").all();
  if (remoteColumns.length && !remoteColumns.some((c) => c.name === "ticket_id")) {
    db.exec("ALTER TABLE remote_sessions ADD COLUMN ticket_id TEXT REFERENCES tickets(id)");
  }
  if (remoteColumns.length && !remoteColumns.some((c) => c.name === "agent_acknowledged_at")) {
    db.exec("ALTER TABLE remote_sessions ADD COLUMN agent_acknowledged_at TEXT");
  }
  if (remoteColumns.length && !remoteColumns.some((c) => c.name === "session_secret")) {
    db.exec("ALTER TABLE remote_sessions ADD COLUMN session_secret TEXT");
  }

  seedItilData(db);
  ensureTicketWorkflowTables(db);
  ensureExtendedCatalogTables(db);
  ensureMultiTenantTables(db);
  ensureAgentEnhancementTables(db);
  ensureObservabilityTables(db);
  ensureProfilePermissionTables(db);
  migrateSecretsAtRest(db);
}

// Perfis e permissões granulares (estilo GLPI 11): cada perfil tem uma matriz
// tela × (ver/criar/modificar/apagar). As matrizes-semente abaixo são REPLICADAS de
// src/lib/permissions.js (SEED_PROFILES) — ao mudar uma, alinhe a outra.
function ensureProfilePermissionTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      description TEXT,
      base_role TEXT NOT NULL DEFAULT 'EMPLOYEE',
      is_system INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      UNIQUE(organization_id, slug),
      FOREIGN KEY (organization_id) REFERENCES organizations(id)
    );
    CREATE TABLE IF NOT EXISTS profile_permissions (
      profile_id TEXT NOT NULL,
      module TEXT NOT NULL,
      can_read INTEGER NOT NULL DEFAULT 0,
      can_create INTEGER NOT NULL DEFAULT 0,
      can_update INTEGER NOT NULL DEFAULT 0,
      can_delete INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (profile_id, module),
      FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_profile_permissions ON profile_permissions(profile_id);
  `);

  const userColumns = db.prepare("PRAGMA table_info(users)").all();
  if (!userColumns.some((column) => column.name === "profile_id")) {
    db.exec("ALTER TABLE users ADD COLUMN profile_id TEXT REFERENCES profiles(id)");
  }

  const C = ["read", "create", "update", "delete"];
  const MODULES = [
    { key: "tickets", actions: C },
    { key: "assets", actions: C },
    { key: "inventory", actions: C },
    { key: "terms", actions: ["read", "create", "delete"] },
    { key: "problems", actions: C },
    { key: "changes", actions: C },
    { key: "knowledge", actions: C },
    { key: "documentation", actions: C },
    { key: "printers", actions: ["read"] },
    { key: "network", actions: C },
    { key: "security", actions: ["read"] },
    { key: "services", actions: C },
    { key: "teams", actions: C },
    { key: "reports", actions: ["read"] },
    { key: "audit", actions: ["read"] },
    { key: "settings", actions: ["read", "update"] },
    { key: "branches", actions: C },
    { key: "locations", actions: C },
    { key: "users", actions: C },
    { key: "profiles", actions: C },
    { key: "ticket_types", actions: C },
    { key: "categories", actions: C },
    { key: "statuses", actions: C },
    { key: "term_templates", actions: C },
    { key: "webhooks", actions: C },
    { key: "remote", actions: ["read"] },
  ];
  const LETTER = { r: "read", c: "create", u: "update", d: "delete" };
  const SEED = [
    { slug: "administrador", name: "Administrador", baseRole: "ADMIN", description: "Acesso total ao sistema e às configurações.", grants: "ALL" },
    { slug: "supervisor", name: "Supervisor", baseRole: "ADMIN", description: "Gestão e visão ampla, sem configurar o sistema nem apagar registros.", grants: { tickets: "rcu", assets: "ru", inventory: "r", network: "r", printers: "r", security: "r", knowledge: "rcu", documentation: "rcu", terms: "r", problems: "rcu", changes: "rcu", services: "r", teams: "ru", reports: "r", audit: "r", users: "r", profiles: "r", remote: "r" } },
    { slug: "tecnico", name: "Técnico", baseRole: "TECHNICIAN", description: "Operação de chamados, ativos e base de conhecimento.", grants: { tickets: "rcud", assets: "rcu", inventory: "ru", network: "rcu", printers: "r", security: "r", knowledge: "rcu", documentation: "rcu", terms: "rc", problems: "rcu", changes: "rcu", services: "r", teams: "r", remote: "r" } },
    { slug: "usuario", name: "Usuário", baseRole: "EMPLOYEE", description: "Portal do usuário final: abre chamados e consulta a base de conhecimento.", grants: { tickets: "rc", knowledge: "r" } },
  ];
  const seedBySlug = Object.fromEntries(SEED.map((s) => [s.slug, s]));
  const grantHas = (seed, module, action) => {
    if (!module.actions.includes(action)) return 0;
    if (seed.grants === "ALL") return 1;
    const letters = seed.grants[module.key] || "";
    return [...letters].some((letter) => LETTER[letter] === action) ? 1 : 0;
  };

  const roleToSlug = { ADMIN: "administrador", TECHNICIAN: "tecnico", EMPLOYEE: "usuario" };
  const now = new Date().toISOString();
  const orgs = db.prepare("SELECT id FROM organizations").all();
  for (const org of orgs) {
    // 1. Garante a existência dos perfis-semente (sem mexer em permissões já gravadas).
    for (const seed of SEED) {
      const existing = db.prepare("SELECT id FROM profiles WHERE organization_id=? AND slug=?").get(org.id, seed.slug);
      if (!existing) {
        db.prepare("INSERT INTO profiles (id, organization_id, name, slug, description, base_role, is_system, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)")
          .run(makeId("prf"), org.id, seed.name, seed.slug, seed.description, seed.baseRole, now);
      }
    }
    // 2. Backfill de permissões por módulo (idempotente, não sobrescreve linhas existentes):
    //    perfis de sistema recebem o default da semente; perfis customizados recebem 0.
    //    Isso também adiciona linhas para MÓDULOS NOVOS em perfis já criados.
    const insertPerm = db.prepare("INSERT OR IGNORE INTO profile_permissions (profile_id, module, can_read, can_create, can_update, can_delete) VALUES (?, ?, ?, ?, ?, ?)");
    const allProfiles = db.prepare("SELECT id, slug, is_system FROM profiles WHERE organization_id=?").all(org.id);
    for (const profile of allProfiles) {
      const seed = profile.is_system ? seedBySlug[profile.slug] : null;
      for (const module of MODULES) {
        const flag = (action) => (seed ? grantHas(seed, module, action) : 0);
        insertPerm.run(profile.id, module.key, flag("read"), flag("create"), flag("update"), flag("delete"));
      }
    }
    // 3. Vincula usuários existentes ao perfil correspondente ao seu role.
    for (const [role, slug] of Object.entries(roleToSlug)) {
      const profile = db.prepare("SELECT id FROM profiles WHERE organization_id=? AND slug=?").get(org.id, slug);
      if (profile) {
        db.prepare("UPDATE users SET profile_id=? WHERE organization_id=? AND role=? AND profile_id IS NULL").run(profile.id, org.id, role);
      }
    }
  }
}

// Série temporal de telemetria (append-only) + alertas de XDR/EPP ingeridos de provedores externos.
function ensureObservabilityTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS asset_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_id TEXT NOT NULL,
      cpu_percent REAL,
      memory_percent REAL,
      disk_percent REAL,
      status TEXT,
      collected_at TEXT NOT NULL,
      FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_asset_metrics_asset_time ON asset_metrics(asset_id, collected_at);
    CREATE TABLE IF NOT EXISTS xdr_alerts (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      asset_id TEXT,
      provider TEXT NOT NULL,
      external_id TEXT,
      severity TEXT NOT NULL DEFAULT 'MEDIUM',
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'NEW',
      raw_json TEXT,
      detected_at TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(organization_id, provider, external_id),
      FOREIGN KEY (organization_id) REFERENCES organizations(id),
      FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_xdr_alerts_org ON xdr_alerts(organization_id, created_at);
  `);
  // Vínculo do alerta com o chamado aberto pelo analista de segurança (dedup).
  const xdrColumns = db.prepare("PRAGMA table_info(xdr_alerts)").all();
  if (!xdrColumns.some((column) => column.name === "ticket_id")) {
    db.exec("ALTER TABLE xdr_alerts ADD COLUMN ticket_id TEXT");
  }
  migrateXdrAlertsUnique(db);
  if (demoSeedEnabled()) ensureXdrAlertSeeds(db);
}

// Semeia alertas XDR de demonstração (primeira execução) para a tela não nascer vazia.
function ensureXdrAlertSeeds(db) {
  const orgs = db.prepare("SELECT id FROM organizations").all();
  for (const org of orgs) {
    const has = db.prepare("SELECT COUNT(*) AS total FROM xdr_alerts WHERE organization_id=?").get(org.id).total;
    if (has) continue;
    const asset = db.prepare("SELECT id FROM assets WHERE organization_id=? LIMIT 1").get(org.id);
    const now = Date.now();
    const seeds = [
      { provider: "DEFENDER", severity: "CRITICAL", status: "NEW", title: "Ransomware detectado: arquivos sendo criptografados", description: "Processo desconhecido começou a criptografar arquivos em massa no disco. Ação imediata recomendada: isolar o host.", hoursAgo: 1 },
      { provider: "SENTINELONE", severity: "HIGH", status: "NEW", title: "Tentativa de phishing bloqueada em anexo de e-mail", description: "Anexo malicioso identificado em e-mail recebido; o usuário pode ter sido alvo de engenharia social.", hoursAgo: 3 },
      { provider: "DEFENDER", severity: "MEDIUM", status: "INVESTIGATING", title: "Múltiplas falhas de login (possível brute force de credenciais)", description: "Sequência de tentativas de autenticação malsucedidas a partir do mesmo host.", hoursAgo: 8 },
      { provider: "DEFENDER", severity: "HIGH", status: "RESOLVED", title: "Trojan detectado e colocado em quarentena", description: "Malware identificado e neutralizado pelo antivírus; nenhuma ação adicional necessária.", hoursAgo: 26 },
    ];
    const insert = db.prepare("INSERT INTO xdr_alerts (id, organization_id, asset_id, provider, external_id, severity, title, description, status, raw_json, detected_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)");
    seeds.forEach((seed, index) => {
      const ts = new Date(now - seed.hoursAgo * 3600000).toISOString();
      insert.run(makeId("xdr"), org.id, asset?.id || null, seed.provider, `seed-${index + 1}`, seed.severity, seed.title, seed.description, seed.status, ts, ts);
    });
  }
}

// ISOLAMENTO MULTI-TENANT: a constraint antiga era UNIQUE(provider, external_id) — GLOBAL,
// sem organization_id. Isso permitia que a ingestão de uma org reescrevesse/movesse o alerta
// de OUTRA org (mesmo external_id) via UPSERT. Recria a tabela com UNIQUE(organization_id,
// provider, external_id). Idempotente: só migra se detectar a constraint antiga.
function migrateXdrAlertsUnique(db) {
  const uniqueIndexes = db.prepare("PRAGMA index_list(xdr_alerts)").all().filter((index) => index.unique);
  let hasOldConstraint = false;
  for (const index of uniqueIndexes) {
    const cols = db.prepare(`PRAGMA index_info('${index.name}')`).all().map((column) => column.name);
    if (cols.length === 2 && cols.includes("provider") && cols.includes("external_id")) hasOldConstraint = true;
  }
  if (!hasOldConstraint) return;

  const hasTicketId = db.prepare("PRAGMA table_info(xdr_alerts)").all().some((column) => column.name === "ticket_id");
  const colList = `id, organization_id, asset_id, provider, external_id, severity, title, description, status, raw_json, detected_at, created_at${hasTicketId ? ", ticket_id" : ""}`;
  db.pragma("foreign_keys = OFF");
  db.transaction(() => {
    db.exec(`CREATE TABLE xdr_alerts_new (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, asset_id TEXT, provider TEXT NOT NULL,
      external_id TEXT, severity TEXT NOT NULL DEFAULT 'MEDIUM', title TEXT NOT NULL, description TEXT,
      status TEXT NOT NULL DEFAULT 'NEW', raw_json TEXT, detected_at TEXT, created_at TEXT NOT NULL,
      ticket_id TEXT,
      UNIQUE(organization_id, provider, external_id),
      FOREIGN KEY (organization_id) REFERENCES organizations(id),
      FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE SET NULL
    );`);
    db.exec(`INSERT INTO xdr_alerts_new (${colList}) SELECT ${colList} FROM xdr_alerts;`);
    db.exec("DROP TABLE xdr_alerts;");
    db.exec("ALTER TABLE xdr_alerts_new RENAME TO xdr_alerts;");
    db.exec("CREATE INDEX IF NOT EXISTS idx_xdr_alerts_org ON xdr_alerts(organization_id, created_at);");
  })();
  db.pragma("foreign_keys = ON");
}

function ensureAgentEnhancementTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ticket_statuses (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      code TEXT NOT NULL,
      label TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_terminal INTEGER NOT NULL DEFAULT 0,
      pauses_sla INTEGER NOT NULL DEFAULT 0,
      allows_messages INTEGER NOT NULL DEFAULT 1,
      color TEXT NOT NULL DEFAULT 'blue',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      UNIQUE(organization_id, code),
      FOREIGN KEY (organization_id) REFERENCES organizations(id)
    );
    CREATE TABLE IF NOT EXISTS locations (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      branch_id TEXT NOT NULL,
      name TEXT NOT NULL,
      code TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      FOREIGN KEY (organization_id) REFERENCES organizations(id),
      FOREIGN KEY (branch_id) REFERENCES branches(id)
    );
    CREATE TABLE IF NOT EXISTS remote_signal_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES remote_sessions(id) ON DELETE CASCADE
    );
  `);

  const ticketColumns = db.prepare("PRAGMA table_info(tickets)").all();
  if (!ticketColumns.some((c) => c.name === "location_id")) db.exec("ALTER TABLE tickets ADD COLUMN location_id TEXT");
  if (!ticketColumns.some((c) => c.name === "sla_paused_at")) db.exec("ALTER TABLE tickets ADD COLUMN sla_paused_at TEXT");

  const settingsColumns = db.prepare("PRAGMA table_info(system_settings)").all();
  if (!settingsColumns.some((c) => c.name === "remote_provider")) {
    db.exec("ALTER TABLE system_settings ADD COLUMN remote_provider TEXT NOT NULL DEFAULT 'NEXUS_WEBRTC'");
  }

  const userColumns = db.prepare("PRAGMA table_info(users)").all();
  if (!userColumns.some((c) => c.name === "location_id")) db.exec("ALTER TABLE users ADD COLUMN location_id TEXT");

  const orgs = db.prepare("SELECT id FROM organizations").all();
  for (const org of orgs) {
    const count = db.prepare("SELECT COUNT(*) total FROM ticket_statuses WHERE organization_id=?").get(org.id).total;
    if (!count) {
      const now = new Date().toISOString();
      const defaults = [
        ["ABERTO", "Aberto", 0, 0, 0, 1, "blue"],
        ["EM_ATENDIMENTO", "Em atendimento", 1, 0, 0, 1, "violet"],
        ["PENDENTE", "Pendente", 2, 0, 1, 1, "amber"],
        ["RESOLVIDO", "Resolvido", 3, 1, 0, 0, "green"],
      ];
      const insert = db.prepare(`
        INSERT INTO ticket_statuses (id, organization_id, code, label, sort_order, is_terminal, pauses_sla, allows_messages, color, active, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
      `);
      for (const [code, label, sort, terminal, pause, messages, color] of defaults) {
        insert.run(`sts_${code.toLowerCase()}_${org.id.slice(0, 8)}`, org.id, code, label, sort, terminal, pause, messages, color, now);
      }
    }
  }
}

function ensureMultiTenantTables(db) {
  const orgColumns = db.prepare("PRAGMA table_info(organizations)").all();
  if (!orgColumns.some((column) => column.name === "slug")) {
    db.exec("ALTER TABLE organizations ADD COLUMN slug TEXT");
    db.prepare("UPDATE organizations SET slug=LOWER(REPLACE(name, ' ', '-')) WHERE slug IS NULL OR slug=''").run();
  }

  const userColumns = db.prepare("PRAGMA table_info(users)").all();
  if (!userColumns.some((column) => column.name === "auth_provider")) {
    db.exec("ALTER TABLE users ADD COLUMN auth_provider TEXT NOT NULL DEFAULT 'LOCAL'");
  }
  if (!userColumns.some((column) => column.name === "external_id")) {
    db.exec("ALTER TABLE users ADD COLUMN external_id TEXT");
  }

  const auditColumns = db.prepare("PRAGMA table_info(audit_logs)").all();
  if (!auditColumns.some((column) => column.name === "branch_id")) {
    db.exec("ALTER TABLE audit_logs ADD COLUMN branch_id TEXT");
  }

  const problemColumns = db.prepare("PRAGMA table_info(problems)").all();
  if (problemColumns.length && !problemColumns.some((column) => column.name === "branch_id")) {
    db.exec("ALTER TABLE problems ADD COLUMN branch_id TEXT");
  }

  const changeColumns = db.prepare("PRAGMA table_info(changes)").all();
  if (changeColumns.length && !changeColumns.some((column) => column.name === "branch_id")) {
    db.exec("ALTER TABLE changes ADD COLUMN branch_id TEXT");
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS branch_auth_settings (
      branch_id TEXT PRIMARY KEY,
      auth_mode TEXT NOT NULL DEFAULT 'LOCAL',
      ldap_url TEXT,
      ldap_base_dn TEXT,
      ldap_bind_dn TEXT,
      ldap_bind_password TEXT,
      ldap_user_filter TEXT NOT NULL DEFAULT '(mail={{email}})',
      ldap_enabled INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
    );
  `);
}

function ensureTicketWorkflowTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS term_templates (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL,
      name TEXT NOT NULL, title TEXT NOT NULL, body_text TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      FOREIGN KEY (organization_id) REFERENCES organizations(id)
    );
  `);

  const typeColumns = db.prepare("PRAGMA table_info(ticket_types)").all();
  const addTypeCol = (name, ddl) => { if (!typeColumns.some((c) => c.name === name)) db.exec(`ALTER TABLE ticket_types ADD COLUMN ${ddl}`); };
  addTypeCol("requires_approval", "requires_approval INTEGER NOT NULL DEFAULT 0");
  addTypeCol("approval_mode", "approval_mode TEXT NOT NULL DEFAULT 'NONE'");
  addTypeCol("default_approver_id", "default_approver_id TEXT");
  addTypeCol("requires_term", "requires_term INTEGER NOT NULL DEFAULT 0");
  addTypeCol("term_template_id", "term_template_id TEXT");
  addTypeCol("scope_mode", "scope_mode TEXT NOT NULL DEFAULT 'ALL'");
  addTypeCol("target_branch_mode", "target_branch_mode TEXT NOT NULL DEFAULT 'REQUESTER'");
  addTypeCol("target_branch_id", "target_branch_id TEXT");
  addTypeCol("checklist_json", "checklist_json TEXT");

  db.exec(`
    CREATE TABLE IF NOT EXISTS ticket_type_branches (
      ticket_type_id TEXT NOT NULL,
      branch_id TEXT NOT NULL,
      PRIMARY KEY (ticket_type_id, branch_id),
      FOREIGN KEY (ticket_type_id) REFERENCES ticket_types(id) ON DELETE CASCADE,
      FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
    );
  `);

  const termColumns = db.prepare("PRAGMA table_info(equipment_terms)").all();
  if (!termColumns.some((c) => c.name === "ticket_id")) db.exec("ALTER TABLE equipment_terms ADD COLUMN ticket_id TEXT REFERENCES tickets(id)");
  if (!termColumns.some((c) => c.name === "term_template_id")) db.exec("ALTER TABLE equipment_terms ADD COLUMN term_template_id TEXT");
  if (!termColumns.some((c) => c.name === "status")) db.exec("ALTER TABLE equipment_terms ADD COLUMN status TEXT NOT NULL DEFAULT 'ASSINADO'");
  if (!termColumns.some((c) => c.name === "body_text")) db.exec("ALTER TABLE equipment_terms ADD COLUMN body_text TEXT");

  const org = db.prepare("SELECT id FROM organizations LIMIT 1").get();
  if (!org) return;
  const now = new Date().toISOString();
  const templateCount = db.prepare("SELECT COUNT(*) total FROM term_templates").get().total;
  if (!templateCount) {
    const templateId = "tmpl_equipamento_padrao";
    db.prepare(`INSERT INTO term_templates (id, organization_id, name, title, body_text, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)`)
      .run(templateId, org.id, "Termo padrão de equipamento", "TERMO DE USO DE EQUIPAMENTO",
        "Declaro que recebi o equipamento vinculado a este chamado, comprometendo-me a zelar pelo uso adequado, não compartilhar credenciais, comunicar incidentes e devolver o item quando solicitado.",
        now, now);
    db.prepare("UPDATE ticket_types SET requires_term=1, term_template_id=? WHERE id='tipo_equipamento'").run(templateId);
    db.prepare("UPDATE ticket_types SET requires_approval=1, approval_mode='SELECT' WHERE id='tipo_acesso'").run();
  }
}

function ensureExtendedCatalogTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ticket_categories (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT 'blue',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      UNIQUE(organization_id, name),
      FOREIGN KEY (organization_id) REFERENCES organizations(id)
    );
    CREATE TABLE IF NOT EXISTS inventory_items (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      branch_id TEXT,
      name TEXT NOT NULL,
      sku TEXT,
      category TEXT,
      quantity INTEGER NOT NULL DEFAULT 0,
      min_quantity INTEGER NOT NULL DEFAULT 0,
      unit TEXT NOT NULL DEFAULT 'un',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (organization_id) REFERENCES organizations(id),
      FOREIGN KEY (branch_id) REFERENCES branches(id)
    );
    CREATE TABLE IF NOT EXISTS inventory_movements (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL,
      ticket_id TEXT,
      user_id TEXT,
      quantity INTEGER NOT NULL,
      movement_type TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (item_id) REFERENCES inventory_items(id),
      FOREIGN KEY (ticket_id) REFERENCES tickets(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  const typeColumns = db.prepare("PRAGMA table_info(ticket_types)").all();
  if (!typeColumns.some((c) => c.name === "category_id")) {
    db.exec("ALTER TABLE ticket_types ADD COLUMN category_id TEXT REFERENCES ticket_categories(id)");
  }

  const templateColumns = db.prepare("PRAGMA table_info(term_templates)").all();
  const addTemplateCol = (name, ddl) => { if (!templateColumns.some((c) => c.name === name)) db.exec(`ALTER TABLE term_templates ADD COLUMN ${ddl}`); };
  addTemplateCol("body_html", "body_html TEXT");
  addTemplateCol("layout_json", "layout_json TEXT");

  const termColumns = db.prepare("PRAGMA table_info(equipment_terms)").all();
  const addTermCol = (name, ddl) => { if (!termColumns.some((c) => c.name === name)) db.exec(`ALTER TABLE equipment_terms ADD COLUMN ${ddl}`); };
  addTermCol("signer_user_id", "signer_user_id TEXT REFERENCES users(id)");
  addTermCol("prepared_by_id", "prepared_by_id TEXT REFERENCES users(id)");
  addTermCol("prepared_at", "prepared_at TEXT");
  addTermCol("signed_at", "signed_at TEXT");
  addTermCol("body_html", "body_html TEXT");
  addTermCol("title", "title TEXT");
  addTermCol("layout_json", "layout_json TEXT");

  const inventoryColumns = db.prepare("PRAGMA table_info(inventory_items)").all();
  const addInventoryCol = (name, ddl) => { if (!inventoryColumns.some((c) => c.name === name)) db.exec(`ALTER TABLE inventory_items ADD COLUMN ${ddl}`); };
  addInventoryCol("auto_reorder", "auto_reorder INTEGER NOT NULL DEFAULT 0");
  addInventoryCol("reorder_ticket_type_id", "reorder_ticket_type_id TEXT");
  addInventoryCol("reorder_assignee_id", "reorder_assignee_id TEXT");
  addInventoryCol("reorder_ticket_id", "reorder_ticket_id TEXT");

  const settingsColumns = db.prepare("PRAGMA table_info(system_settings)").all();
  if (!settingsColumns.some((c) => c.name === "reorder_ticket_type_id")) {
    db.exec("ALTER TABLE system_settings ADD COLUMN reorder_ticket_type_id TEXT");
  }

  const org = db.prepare("SELECT id FROM organizations LIMIT 1").get();
  if (!org) return;
  const now = new Date().toISOString();
  // Categorias padrão POR organização, com IDs ÚNICOS (makeId). Os IDs fixos antigos
  // ("cat_sistema"…) colidiam quando existia uma 2ª org sem categorias: o INSERT
  // estourava UNIQUE constraint dentro de getDb() e derrubava TODA a aplicação (500).
  // Iterar todas as orgs + INSERT OR IGNORE + UPDATE escopado por org corrige o multi-tenant.
  for (const orgRow of db.prepare("SELECT id FROM organizations").all()) {
    const catCount = db.prepare("SELECT COUNT(*) total FROM ticket_categories WHERE organization_id=?").get(orgRow.id).total;
    if (catCount) continue;
    const defaults = [["Sistema", "blue"], ["Acesso", "violet"], ["Hardware", "amber"], ["Compras", "green"]];
    const insertCat = db.prepare("INSERT OR IGNORE INTO ticket_categories (id, organization_id, name, color, active, created_at) VALUES (?, ?, ?, ?, 1, ?)");
    for (const [name, color] of defaults) {
      const catId = makeId("cat");
      insertCat.run(catId, orgRow.id, name, color, now);
      db.prepare("UPDATE ticket_types SET category_id=? WHERE organization_id=? AND category=?").run(catId, orgRow.id, name);
    }
  }

  const invCount = db.prepare("SELECT COUNT(*) total FROM inventory_items WHERE organization_id=?").get(org.id).total;
  if (demoSeedEnabled() && !invCount) {
    const branch = db.prepare("SELECT id FROM branches WHERE organization_id=? LIMIT 1").get(org.id);
    const insertItem = db.prepare(`INSERT INTO inventory_items
      (id, organization_id, branch_id, name, sku, category, quantity, min_quantity, unit, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`);
    const samples = [
      ["Mouse USB", "MOU-001", "Periféricos", 25, 5],
      ["Teclado USB", "TEC-001", "Periféricos", 18, 5],
      ["Toner HP 85A", "TON-85A", "Suprimentos", 6, 2],
    ];
    for (const [name, sku, category, qty, minQty] of samples) {
      insertItem.run(makeId("inv"), org.id, branch?.id || null, name, sku, category, qty, minQty, "un", now, now);
    }
  }
}

function seedItilData(db) {
  const organization = db.prepare("SELECT id FROM organizations LIMIT 1").get();
  if (!organization) return;
  const now = new Date().toISOString();
  const teamCount = db.prepare("SELECT COUNT(*) total FROM teams").get().total;
  if (demoSeedEnabled() && !teamCount) {
    const branches = db.prepare("SELECT id, name FROM branches").all();
    const insertTeam = db.prepare("INSERT INTO teams (id, organization_id, branch_id, name, description, created_at) VALUES (?, ?, ?, ?, ?, ?)");
    const teamIds = {};
    for (const branch of branches) {
      const id = makeId("team");
      teamIds[branch.id] = id;
      insertTeam.run(id, organization.id, branch.id, `Suporte ${branch.name}`, `Equipe de atendimento da unidade ${branch.name}.`, now);
    }
    const technicians = db.prepare("SELECT id, branch_id FROM users WHERE role='TECHNICIAN'").all();
    const insertMember = db.prepare("INSERT OR IGNORE INTO team_members (team_id, user_id) VALUES (?, ?)");
    for (const tech of technicians) {
      const teamId = teamIds[tech.branch_id];
      if (teamId) insertMember.run(teamId, tech.id);
    }
    const firstTeam = Object.values(teamIds)[0];
    if (firstTeam) {
      db.prepare(`INSERT INTO escalation_rules (id, organization_id, name, trigger_type, wait_minutes, priority, team_id, position, active)
        VALUES (?, ?, 'Escalonar sem responsável', 'UNASSIGNED', 30, NULL, ?, 0, 1)`).run(makeId("esc"), organization.id, firstTeam);
      db.prepare(`INSERT INTO escalation_rules (id, organization_id, name, trigger_type, wait_minutes, priority, team_id, position, active)
        VALUES (?, ?, 'Escalonar SLA violado', 'SLA_BREACH', 0, 'CRITICA', ?, 1, 1)`).run(makeId("esc"), organization.id, firstTeam);
    }
  }
  const serviceCount = db.prepare("SELECT COUNT(*) total FROM services").get().total;
  if (demoSeedEnabled() && !serviceCount) {
    const types = db.prepare("SELECT id, name, description FROM ticket_types WHERE organization_id=?").all(organization.id);
    const insert = db.prepare(`INSERT INTO services (id, organization_id, ticket_type_id, name, description, sla_hours, requires_approval, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`);
    for (const type of types) {
      insert.run(makeId("svc"), organization.id, type.id, type.name, type.description || "", 8, type.name.includes("acesso") ? 1 : 0, now);
    }
  }
  db.prepare(`UPDATE tickets SET sla_due_at=datetime(created_at, '+' || COALESCE((SELECT sla_hours FROM system_settings WHERE organization_id=tickets.organization_id), 8) || ' hours')
    WHERE sla_due_at IS NULL`).run();
  db.prepare(`UPDATE tickets SET sla_status=CASE WHEN status='RESOLVIDO' THEN 'OK' WHEN sla_due_at IS NULL THEN 'SEM_SLA' WHEN datetime('now') > sla_due_at THEN 'VIOLADO' WHEN datetime('now') > datetime(sla_due_at, '-1 hour') THEN 'EM_RISCO' ELSE 'DENTRO_PRAZO' END WHERE sla_status IS NULL`).run();
}

function seedFeatureData(db) {
  const organization = db.prepare("SELECT id FROM organizations LIMIT 1").get();
  if (!organization) return;
  const now = new Date().toISOString();
  const branches = db.prepare("SELECT id, name FROM branches ORDER BY type, name").all();
  const articleCount = db.prepare("SELECT COUNT(*) total FROM knowledge_articles").get().total;
  if (!articleCount) {
    db.prepare(`INSERT INTO knowledge_articles
      (id, organization_id, branch_id, title, category, content, created_by, updated_at, created_at)
      VALUES (?, ?, NULL, ?, ?, ?, NULL, ?, ?)`)
      .run("kb_acesso_vpn", organization.id, "Como solicitar acesso VPN", "Acessos", "Abra um chamado do tipo Solicitação de acesso, informe o gestor aprovador e descreva o motivo do acesso remoto.", now, now);
    db.prepare(`INSERT INTO knowledge_articles
      (id, organization_id, branch_id, title, category, content, created_by, updated_at, created_at)
      VALUES (?, ?, NULL, ?, ?, ?, NULL, ?, ?)`)
      .run("kb_lentidao", organization.id, "Checklist para computador lento", "Suporte", "Reinicie a máquina, verifique espaço em disco, feche aplicativos não utilizados e anexe uma captura do Gerenciador de Tarefas ao chamado.", now, now);
  }
  const docCount = db.prepare("SELECT COUNT(*) total FROM it_documents").get().total;
  if (!docCount) {
    const insertDoc = db.prepare(`INSERT INTO it_documents
      (id, organization_id, branch_id, title, document_type, content, updated_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const branch of branches) {
      insertDoc.run(makeId("doc"), organization.id, branch.id, `Documentação de TI - ${branch.name}`, "Inventário", "Registre links de provedores, circuitos, equipamentos críticos, contatos locais e observações operacionais desta unidade.", now, now);
    }
  }
  const netCount = db.prepare("SELECT COUNT(*) total FROM network_devices").get().total;
  if (!netCount && branches.length) {
    const insertDevice = db.prepare(`INSERT INTO network_devices
      (id, organization_id, branch_id, name, device_type, ip_address, status, latency_ms, last_seen_at, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    branches.forEach((branch, index) => {
      insertDevice.run(makeId("net"), organization.id, branch.id, `Gateway ${branch.name}`, "Roteador", `10.${index + 1}.0.1`, "ONLINE", 12 + index * 4, now, "Monitoramento demonstrativo", now);
      insertDevice.run(makeId("net"), organization.id, branch.id, `Switch principal ${branch.name}`, "Switch", `10.${index + 1}.0.2`, index === 1 ? "ALERTA" : "ONLINE", 18 + index * 6, now, "Portas e uplinks principais", now);
    });
  }
}

function ensureAccessDemo(db) {
  const organization = db.prepare("SELECT id FROM organizations LIMIT 1").get();
  if (!organization) return;
  const matrix = db.prepare("SELECT id FROM branches WHERE type='MATRIZ' ORDER BY created_at LIMIT 1").get();
  const campinas = db.prepare("SELECT id FROM branches WHERE code='FILIAL-CPS'").get();
  const curitiba = db.prepare("SELECT id FROM branches WHERE code='FILIAL-CWB'").get();
  const campinasAsset = db.prepare("SELECT id FROM assets WHERE hostname='NB-FIN-023'").get();
  const curitibaAsset = db.prepare("SELECT id FROM assets WHERE hostname='NB-RH-011'").get();
  const now = new Date().toISOString();
  const insert = db.prepare(`INSERT OR IGNORE INTO users
    (id, organization_id, branch_id, name, email, role, created_at, asset_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  insert.run("usr_demo_admin", organization.id, matrix?.id, "Marina Oliveira", "marina@horizonte.local", "ADMIN", now, null);
  insert.run("usr_demo_tecnico_cps", organization.id, campinas?.id, "Rafael Souza", "rafael.campinas@horizonte.local", "TECHNICIAN", now, null);
  insert.run("usr_demo_usuario_cps", organization.id, campinas?.id, "Carlos Mendes", "carlos.demo@horizonte.local", "EMPLOYEE", now, campinasAsset?.id);
  insert.run("usr_demo_tecnico_cwb", organization.id, curitiba?.id, "Beatriz Lima", "beatriz.curitiba@horizonte.local", "TECHNICIAN", now, null);
  insert.run("usr_demo_usuario_cwb", organization.id, curitiba?.id, "Ana Luiza", "ana.curitiba@horizonte.local", "EMPLOYEE", now, curitibaAsset?.id);
  if (campinasAsset) {
    db.prepare("UPDATE users SET asset_id=COALESCE(asset_id, ?) WHERE email IN ('carlos@horizonte.local','carlos.demo@horizonte.local')").run(campinasAsset.id);
  }
}

function ensureTicketCatalog(db) {
  const organization = db.prepare("SELECT id FROM organizations LIMIT 1").get();
  if (!organization) return;
  // Tipos de chamado de exemplo são demonstração: só semear com NEXUS_SEED_DEMO=true.
  // Em produção o admin cria os próprios tipos.
  if (!demoSeedEnabled()) return;
  const count = db.prepare("SELECT COUNT(*) total FROM ticket_types").get().total;
  if (count) return;
  const now = new Date().toISOString();
  const insertType = db.prepare(`INSERT INTO ticket_types
    (id, organization_id, name, description, kind, category, default_priority, active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`);
  const insertField = db.prepare(`INSERT INTO ticket_fields
    (id, ticket_type_id, label, field_type, placeholder, required, options_json, position)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const types = [
    {
      id: "tipo_erro_sistema", name: "Erro em sistema", description: "Falhas, mensagens de erro ou indisponibilidade em aplicações.",
      kind: "INCIDENTE", category: "Sistema", priority: "ALTA",
      fields: [
        ["Sistema afetado", "SELECT", "Selecione o sistema", 1, ["ERP", "Power BI", "E-mail", "Outro"]],
        ["Quando começou?", "DATE", "", 1, null],
        ["Mensagem apresentada", "TEXTAREA", "Copie a mensagem de erro, se houver", 0, null],
        ["Captura de tela", "SCREENSHOT", "", 0, null],
      ],
    },
    {
      id: "tipo_acesso", name: "Solicitação de acesso", description: "Criação, alteração ou remoção de acessos.",
      kind: "REQUISICAO", category: "Acesso", priority: "MEDIA",
      fields: [
        ["Sistema ou recurso", "TEXT", "Ex.: Power BI, pasta financeira", 1, null],
        ["Data necessária", "DATE", "", 1, null],
        ["Nível de acesso", "SELECT", "", 1, ["Leitura", "Edição", "Administrador"]],
        ["Justificativa", "TEXTAREA", "Explique a necessidade do acesso", 1, null],
        ["Documento de aprovação", "FILE", "", 0, null],
      ],
    },
    {
      id: "tipo_equipamento", name: "Problema no computador", description: "Lentidão, travamento ou falha de hardware.",
      kind: "INCIDENTE", category: "Hardware", priority: "MEDIA",
      fields: [
        ["Sintoma principal", "SELECT", "", 1, ["Lentidão", "Travamento", "Não liga", "Tela azul", "Outro"]],
        ["Frequência", "SELECT", "", 1, ["Uma vez", "Às vezes", "Sempre"]],
        ["Detalhes adicionais", "TEXTAREA", "Descreva o que acontece", 1, null],
        ["Foto ou captura", "SCREENSHOT", "", 0, null],
      ],
    },
  ];
  const seed = db.transaction(() => {
    for (const type of types) {
      insertType.run(type.id, organization.id, type.name, type.description, type.kind, type.category, type.priority, now);
      type.fields.forEach((field, index) => insertField.run(makeId("fld"), type.id, field[0], field[1], field[2], field[3], field[4] ? JSON.stringify(field[4]) : null, index));
    }
  });
  seed();
}

function getSqliteDb() {
  const Database = require("better-sqlite3");
  const dataDir = path.join(process.cwd(), "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, "nexus-desk.db");
  const db = new Database(dbPath);
  // Restringe permissões (no-op no Windows, efetivo em Linux/containers): o banco
  // contém hashes de senha, segredos de webhook e tokens de agente.
  try {
    fs.chmodSync(dataDir, 0o700);
    if (fs.existsSync(dbPath)) fs.chmodSync(dbPath, 0o600);
  } catch { /* sistemas sem suporte a chmod */ }
  initialize(db);
  return db;
}

function getPostgresDb() {
  const db = createPgDatabase(process.env.DATABASE_URL);
  initialize(db);
  return db;
}

function getDb() {
  const usePostgres = Boolean(process.env.DATABASE_URL?.trim());
  if (!globalForDb.__nexusDb) {
    globalForDb.__nexusDb = usePostgres ? getPostgresDb() : getSqliteDb();
  }
  ensureRuntimeMigrations(globalForDb.__nexusDb);
  return globalForDb.__nexusDb;
}

module.exports = { getDb, makeId };
