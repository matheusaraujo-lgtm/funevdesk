"use client";

import { useEffect, useState } from "react";
import { Building2, ShieldCheck } from "lucide-react";
import { CrudFormLayout } from "@/components/crud-form-layout";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const typeLabels = { MATRIZ: "Matriz", FILIAL: "Filial" };
const brazilianStates = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];

function emptyForm() {
  return {
    name: "", code: "", type: "FILIAL", city: "", state: "",
    authMode: "LOCAL", ldapEnabled: false, ldapUrl: "", ldapBaseDn: "", ldapBindDn: "", ldapBindPassword: "", ldapUserFilter: "(mail={{email}})",
  };
}

function slugCode(name) {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32);
}

export function BranchFormView({ branchId, branches, onCreate, onSave, onCancel }) {
  const editingBranch = branchId ? branches.find((branch) => branch.id === branchId) : null;
  const [form, setForm] = useState(() => editingBranch ? {
    name: editingBranch.name,
    code: editingBranch.code,
    type: editingBranch.type,
    city: editingBranch.city || "",
    state: editingBranch.state || "",
    authMode: "LOCAL", ldapEnabled: false, ldapUrl: "", ldapBaseDn: "", ldapBindDn: "", ldapBindPassword: "", ldapUserFilter: "(mail={{email}})",
  } : emptyForm());
  const [codeEdited, setCodeEdited] = useState(Boolean(branchId));
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!branchId) return;
    fetch(`/api/branches/${branchId}`, { cache: "no-store" }).then(async (response) => {
      if (!response.ok) return;
      const payload = await response.json();
      const auth = payload.authSettings || {};
      setForm((current) => ({
        ...current,
        authMode: auth.authMode || "LOCAL",
        ldapEnabled: Boolean(auth.ldapEnabled),
        ldapUrl: auth.ldapUrl || "",
        ldapBaseDn: auth.ldapBaseDn || "",
        ldapBindDn: auth.ldapBindDn || "",
        ldapBindPassword: "",
        ldapUserFilter: auth.ldapUserFilter || "(mail={{email}})",
      }));
    });
  }, [branchId]);

  function update(key, value) {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "name" && !codeEdited && !branchId) next.code = slugCode(value);
      return next;
    });
  }

  async function submit(event) {
    event.preventDefault();
    setSubmitting(true);
    const payload = {
      ...form,
      state: form.state || "",
      authSettings: {
        authMode: form.ldapEnabled ? "LDAP" : "LOCAL",
        ldapEnabled: form.ldapEnabled,
        ldapUrl: form.ldapUrl,
        ldapBaseDn: form.ldapBaseDn,
        ldapBindDn: form.ldapBindDn,
        ldapBindPassword: form.ldapBindPassword,
        ldapUserFilter: form.ldapUserFilter,
      },
    };
    const success = branchId ? await onSave(branchId, payload) : await onCreate(payload);
    setSubmitting(false);
    if (success) onCancel();
  }

  return (
    <CrudFormLayout
      title={branchId ? "Editar unidade" : "Nova unidade"}
      description={branchId ? "Atualize dados da matriz ou filial e autenticação LDAP." : "Cadastre uma nova unidade da organização."}
      onCancel={onCancel}
      onSubmit={submit}
      submitLabel={branchId ? "Salvar alterações" : "Criar unidade"}
      submitting={submitting}
      icon={Building2}>
      <div className="sm:col-span-2"><Label htmlFor="branch-name" className="mb-2 block">Nome</Label><Input id="branch-name" required minLength={2} value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="Ex.: Filial Campinas" /></div>
      <div><Label htmlFor="branch-code" className="mb-2 block">Código interno</Label><Input id="branch-code" required minLength={2} value={form.code} onChange={(event) => { setCodeEdited(true); update("code", event.target.value.toUpperCase()); }} placeholder="FILIAL-CPS" /></div>
      <div><Label htmlFor="branch-type" className="mb-2 block">Tipo</Label><Select value={form.type} onValueChange={(value) => update("type", value)}><SelectTrigger id="branch-type" aria-label="Tipo" className="w-full"><SelectValue placeholder="Tipo">{(value) => typeLabels[value]}</SelectValue></SelectTrigger><SelectContent><SelectItem value="MATRIZ">Matriz</SelectItem><SelectItem value="FILIAL">Filial</SelectItem></SelectContent></Select></div>
      <div><Label htmlFor="branch-city" className="mb-2 block">Cidade</Label><Input id="branch-city" value={form.city} onChange={(event) => update("city", event.target.value)} placeholder="Campinas" /></div>
      <div><Label htmlFor="branch-state" className="mb-2 block">Estado (UF)</Label><Select value={form.state || "none"} onValueChange={(value) => update("state", value === "none" ? "" : value)}><SelectTrigger id="branch-state" aria-label="Estado (UF)" className="w-full"><SelectValue placeholder="Selecione">{(value) => value === "none" ? "Não informado" : value}</SelectValue></SelectTrigger><SelectContent><SelectItem value="none">Não informado</SelectItem>{brazilianStates.map((uf) => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}</SelectContent></Select></div>

      <div className="sm:col-span-2 space-y-3 rounded-xl border p-4">
        <div className="flex items-center gap-2"><ShieldCheck className="size-4 text-primary" /><p className="font-semibold">Autenticação LDAP desta unidade</p></div>
        <p className="text-xs text-muted-foreground">Usuários com autenticação LDAP vinculados a esta unidade validam credenciais no diretório da filial.</p>
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.ldapEnabled} onCheckedChange={(value) => update("ldapEnabled", Boolean(value))} />Habilitar LDAP para esta unidade</label>
        {form.ldapEnabled && <>
          <Input value={form.ldapUrl} onChange={(event) => update("ldapUrl", event.target.value)} placeholder="ldap://dc.filial.empresa.local:389" />
          <Input value={form.ldapBaseDn} onChange={(event) => update("ldapBaseDn", event.target.value)} placeholder="Base DN (ex.: DC=filial,DC=empresa,DC=local)" />
          <Input value={form.ldapBindDn} onChange={(event) => update("ldapBindDn", event.target.value)} placeholder="Bind DN (opcional, para busca)" />
          <Input type="password" value={form.ldapBindPassword} onChange={(event) => update("ldapBindPassword", event.target.value)} placeholder="Senha do bind (deixe vazio para manter)" />
          <Input value={form.ldapUserFilter} onChange={(event) => update("ldapUserFilter", event.target.value)} placeholder="Filtro LDAP (use {{email}})" />
        </>}
      </div>
    </CrudFormLayout>
  );
}
