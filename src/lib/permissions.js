// Catálogo de permissões granulares (estilo GLPI 11).
// Fonte da verdade para UI, APIs e validação. As ações por módulo são:
//   read = ver | create = criar | update = modificar | delete = apagar
//
// IMPORTANTE: as matrizes default abaixo (SEED_PROFILES) são REPLICADAS no seed CJS
// em lib-db/index.cjs (ensureProfilePermissionTables). Ao alterar uma, alinhe a outra.

export const ACTIONS = ["read", "create", "update", "delete"];

export const ACTION_LABELS = {
  read: "Ver",
  create: "Criar",
  update: "Modificar",
  delete: "Apagar",
};

const CRUD = ["read", "create", "update", "delete"];

// Cada módulo = uma tela (item de menu). A ordem/agrupamento espelha o menu lateral.
export const MODULES = [
  // Geral
  { key: "tickets", label: "Chamados", actions: CRUD },
  // Ativos
  { key: "assets", label: "Inventário de equipamentos", actions: CRUD },
  { key: "inventory", label: "Estoque", actions: CRUD },
  { key: "terms", label: "Termos de equipamento", actions: ["read", "create", "delete"] },
  // ITSM
  { key: "problems", label: "Problemas", actions: CRUD },
  { key: "changes", label: "Mudanças", actions: CRUD },
  // Conhecimento
  { key: "knowledge", label: "Base de conhecimento", actions: CRUD },
  { key: "documentation", label: "Documentação", actions: CRUD },
  // Monitoramento
  { key: "printers", label: "Impressoras", actions: ["read"] },
  { key: "network", label: "Monitoramento de rede", actions: CRUD },
  { key: "security", label: "Segurança", actions: ["read"] },
  // Administração
  { key: "teams", label: "Equipes", actions: CRUD },
  { key: "reports", label: "Relatórios", actions: ["read"] },
  { key: "audit", label: "Auditoria", actions: ["read"] },
  // Configurações
  { key: "settings", label: "Configurações gerais", actions: ["read", "update"] },
  { key: "branches", label: "Unidades", actions: CRUD },
  { key: "locations", label: "Localizações", actions: CRUD },
  { key: "users", label: "Usuários", actions: CRUD },
  { key: "profiles", label: "Perfis", actions: CRUD },
  { key: "ticket_types", label: "Tipos de chamado", actions: CRUD },
  { key: "categories", label: "Categorias", actions: CRUD },
  { key: "statuses", label: "Situações", actions: CRUD },
  { key: "term_templates", label: "Modelos de termo", actions: CRUD },
  { key: "webhooks", label: "Webhooks", actions: CRUD },
  // Outros
  { key: "remote", label: "Acesso remoto", actions: ["read"] },
];

export const MODULE_KEYS = MODULES.map((module) => module.key);

// Agrupamento para a tela de Perfis (cabeçalhos), espelhando o menu lateral.
export const MODULE_GROUPS = [
  { label: "Geral", modules: ["tickets"] },
  { label: "Ativos", modules: ["assets", "printers"] },
  { label: "ITSM", modules: ["problems", "changes"] },
  { label: "Conhecimento", modules: ["knowledge", "documentation"] },
  { label: "Monitoramento", modules: ["network", "security"] },
  { label: "Administração", modules: ["inventory", "terms", "teams", "reports", "audit"] },
  { label: "Configurações", modules: ["settings", "branches", "locations", "users", "profiles", "ticket_types", "categories", "statuses", "term_templates", "webhooks"] },
  { label: "Acesso remoto", modules: ["remote"] },
];

const ACTION_BY_LETTER = { r: "read", c: "create", u: "update", d: "delete" };

// Perfis-semente. grants: "ALL" = tudo; objeto módulo→letras (rcud) caso contrário.
export const SEED_PROFILES = [
  {
    slug: "administrador",
    name: "Administrador",
    description: "Acesso total ao sistema e às configurações.",
    baseRole: "ADMIN",
    grants: "ALL",
  },
  {
    slug: "supervisor",
    name: "Supervisor",
    description: "Gestão e visão ampla, sem configurar o sistema nem apagar registros.",
    baseRole: "ADMIN",
    grants: {
      tickets: "rcu", assets: "ru", inventory: "r", network: "r", printers: "r", security: "r",
      knowledge: "rcu", documentation: "rcu", terms: "r", problems: "rcu", changes: "rcu",
      teams: "ru", reports: "r", audit: "r", users: "r", profiles: "r", remote: "r",
    },
  },
  {
    slug: "tecnico",
    name: "Técnico",
    description: "Operação de chamados, ativos e base de conhecimento.",
    baseRole: "TECHNICIAN",
    grants: {
      tickets: "rcud", assets: "rcu", inventory: "ru", network: "rcu", printers: "r", security: "r",
      knowledge: "rcu", documentation: "rcu", terms: "rc", problems: "rcu", changes: "rcu",
      teams: "r", remote: "r",
    },
  },
  {
    slug: "usuario",
    name: "Usuário",
    description: "Portal do usuário final: abre chamados e consulta a base de conhecimento.",
    baseRole: "EMPLOYEE",
    grants: { tickets: "rc", knowledge: "r" },
  },
];

const ROLE_TO_SEED_SLUG = { ADMIN: "administrador", TECHNICIAN: "tecnico", EMPLOYEE: "usuario" };

export function moduleSupports(moduleKey, action) {
  const mod = MODULES.find((item) => item.key === moduleKey);
  return Boolean(mod && mod.actions.includes(action));
}

// Matriz vazia (tudo falso) respeitando as ações suportadas por módulo.
export function emptyMatrix() {
  const matrix = {};
  for (const mod of MODULES) {
    matrix[mod.key] = { read: false, create: false, update: false, delete: false };
  }
  return matrix;
}

// Expande os grants de um perfil-semente em uma matriz completa.
export function seedMatrix(grants) {
  const matrix = emptyMatrix();
  for (const mod of MODULES) {
    if (grants === "ALL") {
      for (const action of mod.actions) matrix[mod.key][action] = true;
      continue;
    }
    const letters = grants[mod.key];
    if (!letters) continue;
    for (const letter of letters) {
      const action = ACTION_BY_LETTER[letter];
      if (action && mod.actions.includes(action)) matrix[mod.key][action] = true;
    }
  }
  return matrix;
}

// Fallback quando o usuário ainda não tem profile_id (compatibilidade com dados legados).
export function defaultMatrixForRole(role) {
  const slug = ROLE_TO_SEED_SLUG[role] || "usuario";
  const seed = SEED_PROFILES.find((profile) => profile.slug === slug);
  return seedMatrix(seed.grants);
}

// Checagem granular. Lê user.permissionMap; usuário sem mapa cai no default do role.
export function can(user, moduleKey, action = "read") {
  if (!user) return false;
  const map = user.permissionMap || defaultMatrixForRole(user.role);
  const perm = map[moduleKey];
  return Boolean(perm && perm[action]);
}

// Converte linhas de profile_permissions (DB) em matriz para anexar ao usuário.
export function buildPermissionMap(rows) {
  const matrix = emptyMatrix();
  for (const row of rows || []) {
    if (!matrix[row.module]) continue;
    matrix[row.module] = {
      read: Boolean(row.can_read),
      create: Boolean(row.can_create),
      update: Boolean(row.can_update),
      delete: Boolean(row.can_delete),
    };
  }
  return matrix;
}

// Normaliza uma matriz vinda do cliente, descartando ações não suportadas pelo módulo.
export function sanitizeMatrix(input) {
  const matrix = emptyMatrix();
  for (const mod of MODULES) {
    const incoming = (input && input[mod.key]) || {};
    for (const action of mod.actions) {
      matrix[mod.key][action] = Boolean(incoming[action]);
    }
  }
  return matrix;
}
