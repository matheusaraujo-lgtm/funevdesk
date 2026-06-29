// Verificação E2E do sistema de perfis/permissões granulares.
const BASE = process.env.BASE || "http://localhost:3100";

async function waitForServer(timeoutMs = 90000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/api/auth/me`);
      if (res.status === 401 || res.ok) return true;
    } catch { /* ainda subindo */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Servidor não respondeu a tempo.");
}

async function login(email, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const cookie = res.headers.get("set-cookie");
  return { status: res.status, cookie: cookie ? cookie.split(";")[0] : null, body: await res.json().catch(() => ({})) };
}

const j = (cookie) => ({ Cookie: cookie, "Content-Type": "application/json" });
let pass = 0, fail = 0;
function check(name, ok, extra = "") {
  console.log(`${ok ? "✓" : "✗"} ${name}${extra ? ` — ${extra}` : ""}`);
  ok ? pass++ : fail++;
}

await waitForServer();

// 1. Login admin e lista de perfis
const admin = await login("admin@local", "Admin@123");
check("login admin 200", admin.status === 200, `status=${admin.status}`);

const profilesRes = await fetch(`${BASE}/api/profiles`, { headers: j(admin.cookie) });
const profilesBody = await profilesRes.json();
check("GET /api/profiles 200", profilesRes.status === 200, `status=${profilesRes.status}`);
check("4 perfis-semente", (profilesBody.profiles || []).length >= 4, `n=${profilesBody.profiles?.length}`);
check("catálogo de módulos presente", (profilesBody.modules || []).length >= 15, `n=${profilesBody.modules?.length}`);

// 2. Criar perfil restrito (só tickets:read)
const onlyTicketsRead = Object.fromEntries((profilesBody.modules || []).map((m) => [m.key, { read: m.key === "tickets", create: false, update: false, delete: false }]));
const createRes = await fetch(`${BASE}/api/profiles`, {
  method: "POST",
  headers: j(admin.cookie),
  body: JSON.stringify({ name: "QA Somente Chamados", description: "teste", baseRole: "EMPLOYEE", permissions: onlyTicketsRead }),
});
const created = await createRes.json();
check("POST /api/profiles 201", createRes.status === 201, `status=${createRes.status}`);
const qaProfileId = created.profileId;

// 3. auth/me do admin traz permissionMap completo
const meAdmin = await (await fetch(`${BASE}/api/auth/me`, { headers: j(admin.cookie) })).json();
check("admin permissionMap settings.read=true", meAdmin.permissionMap?.settings?.read === true);
check("admin profile = Administrador", meAdmin.user?.profile?.name === "Administrador", meAdmin.user?.profile?.name);

// 4. Técnico: permissionMap reflete matriz (tickets delete sim, settings não)
const tech = await login("tecnico@local", "Tecnico@123");
const meTech = await (await fetch(`${BASE}/api/auth/me`, { headers: j(tech.cookie) })).json();
check("técnico tickets.delete=true", meTech.permissionMap?.tickets?.delete === true);
check("técnico settings.read=false (sem config)", meTech.permissionMap?.settings?.read === false);
check("técnico não acessa /api/profiles (403)", (await fetch(`${BASE}/api/profiles`, { headers: j(tech.cookie) })).status === 403);

// 5. Usuário (employee): 403 ao tentar criar usuário (sem users:create — authz antes do parse)
const emp = await login("usuario@local", "Usuario@123");
const empUserPost = await fetch(`${BASE}/api/users`, { method: "POST", headers: j(emp.cookie), body: JSON.stringify({}) });
check("usuário POST /api/users → 403", empUserPost.status === 403, `status=${empUserPost.status}`);
// E o técnico (sem users:create) também é bloqueado ao criar usuário
const techUserPost = await fetch(`${BASE}/api/users`, { method: "POST", headers: j(tech.cookie), body: JSON.stringify({}) });
check("técnico POST /api/users → 403", techUserPost.status === 403, `status=${techUserPost.status}`);

// 6. Editar matriz do perfil QA (liga tickets:create) e validar persistência
const putRes = await fetch(`${BASE}/api/profiles/${qaProfileId}`, {
  method: "PUT",
  headers: j(admin.cookie),
  body: JSON.stringify({ name: "QA Somente Chamados", description: "teste", baseRole: "EMPLOYEE", permissions: { ...onlyTicketsRead, tickets: { read: true, create: true, update: false, delete: false } } }),
});
check("PUT /api/profiles/[id] 200", putRes.status === 200, `status=${putRes.status}`);
const afterPut = (await putRes.json()).profiles.find((p) => p.id === qaProfileId);
check("matriz persistiu tickets.create=true", afterPut?.permissions?.tickets?.create === true);

// 7. Perfil de sistema não pode ser apagado
const adminProfile = profilesBody.profiles.find((p) => p.slug === "administrador");
const delSys = await fetch(`${BASE}/api/profiles/${adminProfile.id}`, { method: "DELETE", headers: j(admin.cookie) });
check("DELETE perfil de sistema → 409", delSys.status === 409, `status=${delSys.status}`);

// 8. Apagar o perfil QA de teste (sem usuários vinculados)
const delQa = await fetch(`${BASE}/api/profiles/${qaProfileId}`, { method: "DELETE", headers: j(admin.cookie) });
check("DELETE perfil QA → 200", delQa.status === 200, `status=${delQa.status}`);

// 9. Catálogo expandido: cada item de menu virou um módulo
check("admin tem módulo branches", meAdmin.permissionMap?.branches?.read === true);
check("admin tem webhooks (delete)", meAdmin.permissionMap?.webhooks?.delete === true);
check("admin tem todas as telas de config", ["ticket_types", "categories", "statuses", "term_templates", "locations", "inventory"].every((m) => meAdmin.permissionMap?.[m]?.read === true));
check("técnico inventory.read=true", meTech.permissionMap?.inventory?.read === true);
check("técnico branches.read=false (sem config)", meTech.permissionMap?.branches?.read === false);

// 10. APIs de config: escrita bloqueada por perfil, leitura compartilhada preservada
check("técnico POST /api/webhooks → 403", (await fetch(`${BASE}/api/webhooks`, { method: "POST", headers: j(tech.cookie), body: "{}" })).status === 403);
check("técnico POST /api/categories → 403", (await fetch(`${BASE}/api/categories`, { method: "POST", headers: j(tech.cookie), body: "{}" })).status === 403);
check("técnico GET /api/catalog → 200 (leitura compartilhada intacta)", (await fetch(`${BASE}/api/catalog`, { headers: j(tech.cookie) })).status === 200);
const adminCat = await fetch(`${BASE}/api/categories`, { method: "POST", headers: j(admin.cookie), body: JSON.stringify({ name: "" }) });
check("admin POST /api/categories passa a autorização (não-403)", adminCat.status !== 403, `status=${adminCat.status}`);

console.log(`\nResultado: ${pass} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
