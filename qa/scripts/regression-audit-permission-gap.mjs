// Verificação ao vivo (não só leitura de código) de que módulos como "audit" ignoram a
// matriz granular de permissões: cria um perfil custom baseado em TECHNICIAN com
// audit:read=true explicitamente concedido, cria um usuário nesse perfil, e confirma
// que GET /api/audit ainda devolve 403 (porque a rota checa role==="ADMIN", não a matriz).
import { loginAs, api } from "./lib/http.mjs";

const admin = await loginAs("admin");
const H = { cookie: admin.cookie };

// 1) cria perfil custom com audit:read concedido
const permissions = { tickets: { read: true, create: true, update: false, delete: false }, audit: { read: true, create: false, update: false, delete: false } };
const createProfile = await api("POST", "/api/profiles", { cookie: admin.cookie, body: {
  name: `QA-Auditor-Teste-${Date.now()}`, baseRole: "TECHNICIAN", description: "Perfil de teste do QA agent", permissions,
}});
console.log("create profile:", createProfile.status, JSON.stringify(createProfile.json).slice(0, 300));
const profileId = createProfile.json?.profileId;
if (!profileId) { console.log("Não foi possível criar o perfil de teste — abortando verificação."); process.exit(1); }

// 2) cria usuário nesse perfil
const dash = await api("GET", "/api/dashboard", H);
const branchId = dash.json?.currentUser?.branchId;
const email = `qa-auditor-${Date.now()}@qa.test`;
const createUser = await api("POST", "/api/users", { cookie: admin.cookie, body: {
  name: "QA Auditor Teste", email, password: "QaTeste@123", profileId, branchIds: [branchId], primaryBranchId: branchId,
}});
console.log("create user:", createUser.status, JSON.stringify(createUser.json).slice(0, 200));

// 3) login como o novo usuário e testa /api/audit e /api/users (BUG-002 e BUG-003)
const login = await api("POST", "/api/auth/login", { body: { email, password: "QaTeste@123" } });
const cookie = (login.headers.get("set-cookie") || "").match(/nexus_session=[^;]+/)?.[0] || "";
console.log("login novo usuário:", login.status);
const auditCheck = await api("GET", "/api/audit", { cookie });
console.log("GET /api/audit com audit:read=true concedido no perfil:", auditCheck.status, JSON.stringify(auditCheck.json).slice(0, 150));
const auditOk = auditCheck.status === 200;
console.log(auditOk
  ? "=> OK: audit:read=true concedido pela matriz granular é respeitado pela API (BUG-002 corrigido)."
  : `=> REGRESSÃO: esperado 200 com a permissão concedida, obteve ${auditCheck.status} — BUG-002 voltou.`);

// BUG-003: este perfil de teste NÃO tem users:read nem canManageTickets/canConfigure —
// então GET /api/users deve dar 403 aqui (perfil sem nenhuma das 3 vias de acesso).
const usersCheck = await api("GET", "/api/users", { cookie });
const usersOk = usersCheck.status === 403;
console.log("GET /api/users sem nenhuma permissão relevante:", usersCheck.status, usersOk ? "=> OK: bloqueado como esperado." : "=> REGRESSÃO: deveria bloquear.");

// Limpeza: remove o usuário e o perfil de teste criados por esta verificação (SEMPRE roda,
// mesmo se algum check falhar — antes ficava pulada por causa de um process.exit() precoce,
// deixando perfis/usuários QA-Auditor-Teste-* órfãos no banco; corrigido 2026-08-20).
const userId = createUser.json?.userId;
if (userId) {
  const del = await api("DELETE", `/api/users/${userId}`, H);
  console.log("cleanup user:", del.status);
}
if (profileId) {
  const delP = await api("DELETE", `/api/profiles/${profileId}`, H);
  console.log("cleanup profile:", delP.status);
}

process.exit(auditOk && usersOk ? 0 : 1);
