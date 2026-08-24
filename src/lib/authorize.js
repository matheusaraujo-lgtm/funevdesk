import { requireCurrentUser, can } from "@/lib/auth";
import { canAccessBranch } from "@/lib/branch-scope";

/**
 * Gate ÚNICO de autorização das rotas de API.
 *
 * Toda rota autenticada deve abrir com:
 *
 *   const auth = authorize(request, { module: "problems", action: "update" });
 *   if (auth.error) return auth.error;
 *
 * e, ao operar sobre um registro com unidade, aplicar o gate de linha DEPOIS de
 * carregar o registro (e também sobre a unidade de destino em criações/movimentações):
 *
 *   const denied = auth.branchGate(row.branch_id);
 *   if (denied) return denied;
 *
 * Opções:
 * - module/action: permissão granular do perfil (matriz GLPI-like via can()).
 * - anyOf: [["locations"], ["tickets", "create"]] — libera se QUALQUER par passar.
 * - allBranches: true — exige o flag all_branches (ações org-wide, ex.: webhooks).
 *
 * branchGate(branchId, { allowNull }): branch_id nulo = registro org-level, permitido
 * por padrão (padrão dominante: equipes/artigos/itens globais). Para criações em que a
 * unidade é obrigatória, use { allowNull: false }.
 *
 * Enforcement: qa/scripts/authz-static.mjs falha o CI quando uma rota nova não usa um
 * gate de autorização — a classe de bug "esqueci o escopo de unidade" vira erro de build,
 * não disciplina individual. Rotas legadas com requirePermission/requireCurrentUser +
 * canAccessBranch/assertBranchAccess seguem válidas; código novo usa authorize().
 */
export function authorize(request, options = {}) {
  const { module, action = "read", anyOf, allBranches = false } = options;
  const auth = requireCurrentUser(request);
  if (auth.error) return auth;
  const user = auth.user;
  if (module && !can(user, module, action)) {
    return { error: Response.json({ error: "Acesso negado." }, { status: 403 }) };
  }
  if (anyOf && !anyOf.some(([m, a]) => can(user, m, a || "read"))) {
    return { error: Response.json({ error: "Acesso negado." }, { status: 403 }) };
  }
  if (allBranches && !user.all_branches) {
    return { error: Response.json({ error: "Apenas administradores com acesso a todas as unidades podem executar esta ação." }, { status: 403 }) };
  }
  const branchGate = (branchId, { allowNull = true, message = "Acesso negado." } = {}) => {
    if (branchId == null || branchId === "") {
      return allowNull ? null : Response.json({ error: message }, { status: 403 });
    }
    return canAccessBranch(user, branchId) ? null : Response.json({ error: message }, { status: 403 });
  };
  return { user, branchGate };
}
