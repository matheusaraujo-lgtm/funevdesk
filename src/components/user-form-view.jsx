"use client";

import { useState } from "react";
import { CircleAlert, CircleCheck, Eye, EyeOff, UserRound } from "lucide-react";
import { toast } from "sonner";
import { CrudFormLayout } from "@/components/crud-form-layout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Mesma regra de src/lib/security.js · STRONG_PASSWORD_REGEX (mantida em duplicata porque o
// form roda no cliente — sem acesso ao módulo de servidor).
const STRONG_PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{8,}$/;

const roleLabels = { ADMIN: "Administrador", TECHNICIAN: "Técnico", EMPLOYEE: "Usuário" };

// Aceita e-mail completo OU login no formato nome.sobrenome (mesmo critério do backend).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-z0-9]+([._-][a-z0-9]+)+$/i;
// Espelha normalizeLogin() de /api/users: remove acentos antes de validar, senão o form
// barra logins que o backend aceita ("arthur.França" -> "arthur.franca").
function normalizeLogin(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}
function isValidLogin(value) {
  const v = normalizeLogin(value);
  if (!v || v.length > 180) return false;
  return EMAIL_RE.test(v) || USERNAME_RE.test(v);
}

function defaultProfileId(profiles) {
  if (!profiles.length) return "";
  return (profiles.find((profile) => profile.baseRole === "EMPLOYEE") || profiles[0]).id;
}

function emptyForm(branches, profiles) {
  const firstBranch = branches[0]?.id || "";
  return { name: "", email: "", role: "EMPLOYEE", profileId: defaultProfileId(profiles), branchIds: firstBranch ? [firstBranch] : [], primaryBranchId: firstBranch, allBranches: false, assetId: "none", authProvider: "LOCAL", password: "" };
}

function formFromUser(user, profiles) {
  return {
    name: user.name,
    email: user.email,
    role: user.role,
    profileId: user.profileId || defaultProfileId(profiles),
    branchIds: user.branchIds,
    primaryBranchId: user.branch_id,
    allBranches: user.allBranches || false,
    assetId: user.asset_id || "none",
    authProvider: user.authProvider || "LOCAL",
  };
}

export function UserFormView({ userId, users, branches, assets, profiles = [], canGrantAllBranches = false, onCreate, onSave, onCancel }) {
  const editingUser = userId ? users.find((user) => user.id === userId) : null;
  const [form, setForm] = useState(() => (editingUser ? formFromUser(editingUser, profiles) : emptyForm(branches, profiles)));
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const selectedAssets = assets.filter((asset) => form.branchIds.includes(asset.branch_id));
  const primaryBranch = branches.find((branch) => branch.id === form.primaryBranchId);
  const primaryBranchLdapEnabled = Boolean(primaryBranch?.ldap_enabled);

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => (current[key] ? { ...current, [key]: undefined } : current));
  }

  function toggleBranch(branchId) {
    setForm((current) => {
      const selected = current.branchIds.includes(branchId);
      const branchIds = selected ? current.branchIds.filter((id) => id !== branchId) : [...current.branchIds, branchId];
      if (!branchIds.length) return current;
      const primaryBranchId = branchIds.includes(current.primaryBranchId) ? current.primaryBranchId : branchIds[0];
      const asset = assets.find((item) => item.id === current.assetId);
      return { ...current, branchIds, primaryBranchId, assetId: asset && branchIds.includes(asset.branch_id) ? current.assetId : "none" };
    });
    setErrors((current) => ({ ...current, branchIds: undefined, primaryBranchId: undefined }));
  }

  // Validação inline por campo: mensagem específica abaixo de cada campo + destaque (aria-invalid).
  function validate() {
    const next = {};
    if (form.name.trim().length < 3) next.name = "Informe o nome completo (mínimo 3 caracteres).";
    if (!isValidLogin(form.email)) next.email = "Informe um e-mail válido ou um login no formato nome.sobrenome.";
    if (profiles.length > 0 && !form.profileId) next.profileId = "Selecione um perfil de acesso.";
    if (!form.branchIds.length) next.branchIds = "Selecione ao menos uma unidade autorizada.";
    else if (!form.primaryBranchId) next.primaryBranchId = "Escolha a unidade principal.";
    // LDAP usa o AD configurado na unidade PRINCIPAL do usuário (cada unidade pode ter o seu,
    // ou nenhum) — sem essa checagem dava pra criar um usuário LDAP numa unidade sem AD
    // nenhum, e ele nunca mais conseguiria entrar.
    if (form.authProvider === "LDAP" && form.primaryBranchId && !primaryBranchLdapEnabled) {
      next.authProvider = "A unidade principal escolhida não tem LDAP habilitado. Habilite em Configurações > Unidades ou use senha local.";
    }
    // Senha é opcional (em branco = sistema gera uma temporária) — só valida força se algo foi digitado.
    if (!userId && form.authProvider === "LOCAL" && form.password && !STRONG_PASSWORD_REGEX.test(form.password)) {
      next.password = "A senha deve ter ao menos 8 caracteres, com maiúscula, minúscula, número e símbolo.";
    }
    return next;
  }

  async function submit(event) {
    event.preventDefault();
    const validation = validate();
    setErrors(validation);
    if (Object.keys(validation).length) {
      toast.error("Revise os campos destacados.");
      return;
    }
    setSubmitting(true);
    // profileId vazio = a lista de perfis não carregou (ex.: técnico não tem profiles:read e o
    // form caiu no seletor de papel legado). Envia ausente, não "", senão o schema rejeita.
    const payload = {
      ...form,
      profileId: form.profileId || undefined,
      assetId: form.assetId === "none" ? null : form.assetId,
    };
    const success = userId ? await onSave(userId, payload) : await onCreate(payload);
    setSubmitting(false);
    if (success) onCancel();
  }

  const fieldError = (key) => errors[key] && <p className="mt-1.5 text-xs font-medium text-destructive">{errors[key]}</p>;

  return (
    <CrudFormLayout
      title={userId ? "Editar usuário" : "Novo usuário"}
      description={userId ? "Atualize perfil, unidades autorizadas e equipamento vinculado." : "Cadastre um novo acesso ao sistema."}
      onCancel={onCancel}
      onSubmit={submit}
      submitLabel={userId ? "Salvar alterações" : "Criar usuário"}
      submitting={submitting}
      noValidate
      icon={UserRound}>
      <div className="sm:col-span-2"><Label htmlFor="user-name" className="mb-2 block">Nome</Label><Input id="user-name" value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="Nome completo" aria-invalid={errors.name ? true : undefined} />{fieldError("name")}</div>
      <div className="sm:col-span-2"><Label htmlFor="user-email" className="mb-2 block">E-mail ou usuário</Label><Input id="user-email" type="text" value={form.email} onChange={(event) => update("email", event.target.value)} placeholder="usuario@empresa.com ou nome.sobrenome" aria-invalid={errors.email ? true : undefined} />{fieldError("email")}</div>
      {profiles.length > 0 ? (
        <div><Label htmlFor="user-profile" className="mb-2 block">Perfil</Label><Select value={form.profileId} onValueChange={(value) => update("profileId", value)}><SelectTrigger id="user-profile" aria-label="Perfil" aria-invalid={errors.profileId ? true : undefined} className="w-full"><SelectValue placeholder="Selecione um perfil">{(value) => profiles.find((profile) => profile.id === value)?.name}</SelectValue></SelectTrigger><SelectContent>{profiles.map((profile) => <SelectItem key={profile.id} value={profile.id}>{profile.name}</SelectItem>)}</SelectContent></Select>{fieldError("profileId") || <p className="mt-2 text-xs text-muted-foreground">O perfil define quais telas o usuário acessa e o que pode fazer.</p>}</div>
      ) : (
        <div><Label htmlFor="user-role" className="mb-2 block">Perfil</Label><Select value={form.role} onValueChange={(value) => update("role", value)}><SelectTrigger id="user-role" aria-label="Perfil" className="w-full"><SelectValue placeholder="Perfil">{(value) => roleLabels[value]}</SelectValue></SelectTrigger><SelectContent>{Object.entries(roleLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
      )}
      <div>
        <Label htmlFor="user-auth-provider" className="mb-2 block">Autenticação</Label>
        <Select value={form.authProvider} onValueChange={(value) => update("authProvider", value)}>
          <SelectTrigger id="user-auth-provider" aria-label="Autenticação" aria-invalid={errors.authProvider ? true : undefined} className="w-full"><SelectValue>{(value) => value === "LDAP" ? "LDAP da unidade principal" : "Senha local"}</SelectValue></SelectTrigger>
          <SelectContent><SelectItem value="LOCAL">Senha local</SelectItem><SelectItem value="LDAP">LDAP da unidade principal</SelectItem></SelectContent>
        </Select>
        {fieldError("authProvider") || (
          form.authProvider === "LDAP" ? (
            primaryBranch ? (
              primaryBranchLdapEnabled ? (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-emerald-600"><CircleCheck className="mt-0.5 size-3.5 shrink-0" />LDAP habilitado em &quot;{primaryBranch.name}&quot; — as credenciais serão validadas nesse diretório.</p>
              ) : (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-600"><CircleAlert className="mt-0.5 size-3.5 shrink-0" />&quot;{primaryBranch.name}&quot; não tem LDAP habilitado. Configure em Unidades antes de salvar, ou escolha outra unidade principal.</p>
              )
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">Escolha a unidade principal abaixo para conferir se o LDAP dela está habilitado.</p>
            )
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">Login e senha ficam salvos e gerenciados aqui mesmo, sem depender de diretório externo.</p>
          )
        )}
      </div>
      {!userId && form.authProvider === "LOCAL" && (
        <div className="sm:col-span-2">
          <Label htmlFor="user-password" className="mb-2 block">Senha (opcional)</Label>
          <div className="relative">
            <Input
              id="user-password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={form.password}
              onChange={(event) => update("password", event.target.value)}
              placeholder="Opcional"
              aria-invalid={errors.password ? true : undefined}
              className="pr-10"
            />
            <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}>
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {fieldError("password") || <p className="mt-2 text-xs text-muted-foreground">{form.password ? "Essa será a senha definitiva — o usuário não precisará trocá-la no primeiro acesso." : "Se preencher, defina a senha aqui. Se deixar em branco, o sistema gera uma temporária que o usuário troca no primeiro acesso."}</p>}
        </div>
      )}
      {(canGrantAllBranches || form.allBranches) && (
      <div className="sm:col-span-2">
        <Button type="button" variant="ghost" className="h-auto w-full justify-start gap-3 rounded-xl border px-3 py-2.5" disabled={!canGrantAllBranches} onClick={() => update("allBranches", !form.allBranches)}>
          <Checkbox checked={form.allBranches} tabIndex={-1} />
          <span className="text-left"><span className="block text-sm font-medium">Acesso a todas as unidades</span><span className="block text-xs text-muted-foreground">Vê dados da matriz e de todas as filiais. Deixe DESMARCADO para limitar às unidades selecionadas abaixo.{!canGrantAllBranches ? " Apenas um administrador com acesso total pode alterar." : ""}</span></span>
        </Button>
      </div>
      )}
      <div className="sm:col-span-2"><p className="mb-2 text-sm font-medium">Unidades autorizadas</p><div className="grid gap-2 rounded-xl border p-3 sm:grid-cols-2">{branches.map((branch) => <Button key={branch.id} type="button" variant="ghost" className="h-auto justify-start gap-3 px-2 py-2" onClick={() => toggleBranch(branch.id)}><Checkbox checked={form.branchIds.includes(branch.id)} tabIndex={-1} /><span className="text-left">{branch.name}</span></Button>)}</div>{fieldError("branchIds") || <p className="mt-2 text-xs text-muted-foreground">Marque as unidades que o usuário pode acessar. A unidade principal é escolhida entre elas{form.allBranches ? " (ignorado enquanto “Todas as unidades” estiver marcado, exceto a principal usada na abertura de chamados)" : ""}.</p>}</div>
      <div className="sm:col-span-2"><Label htmlFor="user-primary-branch" className="mb-2 block">Unidade principal</Label><Select value={form.primaryBranchId} onValueChange={(value) => update("primaryBranchId", value)}><SelectTrigger id="user-primary-branch" aria-label="Unidade principal" aria-invalid={errors.primaryBranchId ? true : undefined} className="w-full"><SelectValue placeholder="Selecione">{(value) => branches.find((branch) => branch.id === value)?.name}</SelectValue></SelectTrigger><SelectContent>{branches.filter((branch) => form.branchIds.includes(branch.id)).map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}</SelectContent></Select>{fieldError("primaryBranchId") || <p className="mt-2 text-xs text-muted-foreground">Padrão do usuário ao abrir chamados. Só lista unidades autorizadas acima.</p>}</div>
      <div className="sm:col-span-2"><Label htmlFor="user-asset" className="mb-2 block">Equipamento</Label><Select value={form.assetId} onValueChange={(value) => update("assetId", value)}><SelectTrigger id="user-asset" aria-label="Equipamento" className="w-full"><SelectValue placeholder="Não vincular">{(value) => value === "none" ? "Não vincular" : assets.find((asset) => asset.id === value)?.hostname}</SelectValue></SelectTrigger><SelectContent><SelectItem value="none">Não vincular</SelectItem>{selectedAssets.map((asset) => <SelectItem key={asset.id} value={asset.id}>{asset.hostname} · {asset.branch_name}</SelectItem>)}</SelectContent></Select></div>
    </CrudFormLayout>
  );
}
