"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Lock, Plus, Save, ShieldCheck, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { useReloadableData } from "@/lib/use-reloadable-data";
import { ListEmptyState } from "@/components/list-empty-state";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { MODULES, MODULE_GROUPS } from "@/lib/permissions";

const ACTIONS = ["read", "create", "update", "delete"];
const ACTION_LABELS = { read: "Ver", create: "Criar", update: "Modificar", delete: "Apagar" };
const BASE_ROLE_LABELS = { ADMIN: "Administrador", TECHNICIAN: "Técnico", EMPLOYEE: "Usuário" };
const BASE_ROLE_HINT = "Define o alcance por unidade: Administrador enxerga todas as filiais; Técnico, as suas; Usuário, apenas os próprios chamados.";
const MODULE_BY_KEY = Object.fromEntries(MODULES.map((module) => [module.key, module]));

function emptyPermissions() {
  return MODULES.reduce((acc, module) => {
    acc[module.key] = { read: false, create: false, update: false, delete: false };
    return acc;
  }, {});
}

export function ProfilesView({ can = () => false, onProfilesChanged }) {
  const [profiles, setProfiles] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", description: "", baseRole: "EMPLOYEE" });
  const [deleteTarget, setDeleteTarget] = useState(null);

  const canCreate = can("profiles", "create");
  const canUpdate = can("profiles", "update");
  const canDelete = can("profiles", "delete");

  const applyResult = useCallback((payload, keepId) => {
    setProfiles(payload.profiles || []);
    if (onProfilesChanged) onProfilesChanged(payload.profiles || []);
    if (keepId) setSelectedId(keepId);
  }, [onProfilesChanged]);

  const { loading, reload: load } = useReloadableData(useCallback(async () => {
    const response = await fetch("/api/profiles", { cache: "no-store" });
    if (response.ok) {
      const payload = await response.json();
      setProfiles(payload.profiles || []);
      setSelectedId((current) => current || payload.profiles?.[0]?.id || null);
    } else {
      toast.error("Não foi possível carregar os perfis.");
    }
  }, []));

  const selected = useMemo(() => profiles.find((profile) => profile.id === selectedId) || null, [profiles, selectedId]);

  // Sincroniza o rascunho editável sempre que o perfil selecionado muda.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!selected) { setDraft(null); return; }
    setDraft({
      name: selected.name,
      description: selected.description || "",
      baseRole: selected.baseRole,
      permissions: { ...emptyPermissions(), ...structuredClone(selected.permissions || {}) },
    });
  }, [selected]);

  function toggle(moduleKey, action, value) {
    setDraft((current) => ({
      ...current,
      permissions: {
        ...current.permissions,
        [moduleKey]: { ...current.permissions[moduleKey], [action]: value },
      },
    }));
  }

  // Liga/desliga todas as ações suportadas de um módulo (linha).
  function toggleModule(module, value) {
    setDraft((current) => {
      const next = { read: false, create: false, update: false, delete: false };
      for (const action of module.actions) next[action] = value;
      return { ...current, permissions: { ...current.permissions, [module.key]: next } };
    });
  }

  // Liga/desliga todas as ações de todos os módulos de uma seção do menu.
  function toggleGroup(group, value) {
    setDraft((current) => {
      const permissions = { ...current.permissions };
      for (const key of group.modules) {
        const mod = MODULE_BY_KEY[key];
        if (!mod) continue;
        const next = { read: false, create: false, update: false, delete: false };
        for (const action of mod.actions) next[action] = value;
        permissions[key] = next;
      }
      return { ...current, permissions };
    });
  }

  async function save() {
    if (!selected || !draft) return;
    setSaving(true);
    const response = await fetch(`/api/profiles/${selected.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    setSaving(false);
    if (!response.ok) {
      toast.error((await response.json().catch(() => ({}))).error || "Não foi possível salvar o perfil.");
      return;
    }
    applyResult(await response.json(), selected.id);
    toast.success("Perfil atualizado.");
  }

  async function create() {
    if (!createForm.name.trim()) { toast.error("Informe um nome para o perfil."); return; }
    const response = await fetch("/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...createForm, permissions: emptyPermissions() }),
    });
    if (!response.ok) {
      toast.error((await response.json().catch(() => ({}))).error || "Não foi possível criar o perfil.");
      return;
    }
    const payload = await response.json();
    applyResult(payload, payload.profileId);
    setCreateOpen(false);
    setCreateForm({ name: "", description: "", baseRole: "EMPLOYEE" });
    toast.success("Perfil criado. Ajuste as permissões e salve.");
  }

  async function remove() {
    if (!deleteTarget) return;
    const response = await fetch(`/api/profiles/${deleteTarget.id}`, { method: "DELETE" });
    if (!response.ok) {
      toast.error((await response.json().catch(() => ({}))).error || "Não foi possível excluir o perfil.");
      return;
    }
    const payload = await response.json();
    if (selectedId === deleteTarget.id) setSelectedId(payload.profiles?.[0]?.id || null);
    applyResult(payload);
    setDeleteTarget(null);
    toast.success("Perfil excluído.");
  }

  return <div className="space-y-5 pb-6">
    <PageHeader
      icon={ShieldCheck}
      title="Perfis"
      description="Defina, por tela, o que cada perfil pode ver, criar, modificar e apagar."
      actions={canCreate ? <Button onClick={() => setCreateOpen(true)}><Plus /> Novo perfil</Button> : null}
    />

    {loading ? (
      <Card className="rounded-2xl border-0 shadow-none ring-1 ring-foreground/10"><CardContent className="p-10 text-center text-sm text-muted-foreground">Carregando perfis…</CardContent></Card>
    ) : profiles.length === 0 ? (
      <Card className="rounded-2xl border-0 shadow-none ring-1 ring-foreground/10">
        <ListEmptyState icon={ShieldCheck} title="Nenhum perfil" description="Crie um perfil para conceder acessos." actionLabel={canCreate ? "Novo perfil" : undefined} onAction={canCreate ? () => setCreateOpen(true) : undefined} />
      </Card>
    ) : (
      <div className="grid items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* Lista de perfis */}
        <Card className="gap-0 overflow-hidden rounded-2xl border-0 py-0 shadow-none ring-1 ring-foreground/10">
          <div className="border-b p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Perfis</div>
          <div className="divide-y">
            {profiles.map((profile) => (
              <button
                key={profile.id}
                onClick={() => setSelectedId(profile.id)}
                className={`flex w-full items-start gap-3 p-3 text-left transition-colors hover:bg-muted/50 ${selectedId === profile.id ? "border-l-2 border-l-primary bg-muted" : "border-l-2 border-l-transparent"}`}>
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><ShieldCheck className="size-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 font-medium">{profile.name} {profile.isSystem && <Lock className="size-3 text-muted-foreground" />}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                    <Badge variant="outline" className="font-normal">{BASE_ROLE_LABELS[profile.baseRole] || profile.baseRole}</Badge>
                    <span className="inline-flex items-center gap-1"><Users className="size-3" />{profile.userCount}</span>
                  </span>
                </span>
              </button>
            ))}
          </div>
        </Card>

        {/* Editor de matriz */}
        {selected && draft && (
          <Card className="gap-0 overflow-hidden rounded-2xl border-0 py-0 shadow-none ring-1 ring-foreground/10">
            <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="grid flex-1 gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="profile-name">Nome</Label>
                  <Input id="profile-name" value={draft.name} disabled={selected.isSystem || !canUpdate}
                    onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="profile-base-role">Alcance (base)</Label>
                  <Select value={draft.baseRole} onValueChange={(value) => setDraft({ ...draft, baseRole: value })} disabled={selected.isSystem || !canUpdate}>
                    <SelectTrigger id="profile-base-role"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(BASE_ROLE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5 sm:col-span-2">
                  <Label htmlFor="profile-description">Descrição</Label>
                  <Textarea id="profile-description" rows={2} value={draft.description} disabled={!canUpdate}
                    onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
                </div>
              </div>
            </div>
            <p className="border-b bg-muted/20 px-4 py-2 text-xs text-muted-foreground">{BASE_ROLE_HINT}</p>

            <div className="overflow-x-auto">
              <Table className="min-w-[560px]">
                <TableHeader>
                  <TableRow className="bg-muted/10">
                    <TableHead className="min-w-[200px]">Tela</TableHead>
                    {ACTIONS.map((action) => <TableHead key={action} className="text-center">{ACTION_LABELS[action]}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {MODULE_GROUPS.map((group) => {
                    const groupModules = group.modules.map((key) => MODULE_BY_KEY[key]).filter(Boolean);
                    if (!groupModules.length) return null;
                    const groupAllOn = groupModules.every((module) => module.actions.every((action) => draft.permissions[module.key]?.[action]));
                    return (
                      <Fragment key={group.label}>
                        {/* Cabeçalho da seção (espelha o menu) */}
                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                          <TableCell colSpan={1 + ACTIONS.length} className="py-1.5">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</span>
                              {canUpdate && (
                                <button type="button" onClick={() => toggleGroup(group, !groupAllOn)}
                                  className="text-xs font-medium text-primary hover:underline">
                                  {groupAllOn ? "Limpar seção" : "Marcar tudo"}
                                </button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                        {groupModules.map((module) => {
                          const perm = draft.permissions[module.key] || {};
                          const allOn = module.actions.every((action) => perm[action]);
                          return (
                            <TableRow key={module.key}>
                              <TableCell className="pl-6">
                                <button type="button" disabled={!canUpdate} onClick={() => toggleModule(module, !allOn)}
                                  className="text-left font-medium hover:text-primary disabled:cursor-default disabled:hover:text-foreground">
                                  {module.label}
                                </button>
                              </TableCell>
                              {ACTIONS.map((action) => {
                                const supported = module.actions.includes(action);
                                return (
                                  <TableCell key={action} className="text-center">
                                    {supported ? (
                                      <span className="inline-flex justify-center">
                                        <Checkbox checked={Boolean(perm[action])} disabled={!canUpdate}
                                          onCheckedChange={(value) => toggle(module.key, action, Boolean(value))}
                                          aria-label={`${ACTION_LABELS[action]} ${module.label}`} />
                                      </span>
                                    ) : <span className="text-muted-foreground/40">—</span>}
                                  </TableCell>
                                );
                              })}
                            </TableRow>
                          );
                        })}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between gap-3 border-t p-4">
              <div>
                {!selected.isSystem && canDelete && (
                  <Button variant="destructive" size="sm" onClick={() => setDeleteTarget(selected)}><Trash2 /> Excluir perfil</Button>
                )}
                {selected.isSystem && <span className="text-xs text-muted-foreground">Perfil de sistema: nome e alcance são fixos, mas as permissões são editáveis.</span>}
              </div>
              <Button onClick={save} disabled={saving || !canUpdate}><Save /> {saving ? "Salvando…" : "Salvar permissões"}</Button>
            </div>
          </Card>
        )}
      </div>
    )}

    {/* Criar perfil */}
    <Dialog open={createOpen} onOpenChange={setCreateOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo perfil</DialogTitle>
          <DialogDescription>Crie o perfil e, em seguida, marque as permissões por tela.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-1.5">
            <Label htmlFor="new-name">Nome</Label>
            <Input id="new-name" value={createForm.name} onChange={(event) => setCreateForm({ ...createForm, name: event.target.value })} placeholder="Ex.: Atendente N1" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="new-base-role">Alcance (base)</Label>
            <Select value={createForm.baseRole} onValueChange={(value) => setCreateForm({ ...createForm, baseRole: value })}>
              <SelectTrigger id="new-base-role"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(BASE_ROLE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="new-description">Descrição</Label>
            <Textarea id="new-description" rows={2} value={createForm.description} onChange={(event) => setCreateForm({ ...createForm, description: event.target.value })} />
          </div>
          <p className="text-xs text-muted-foreground">{BASE_ROLE_HINT}</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
          <Button onClick={create}><Plus /> Criar perfil</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Excluir perfil */}
    <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir perfil</DialogTitle>
          <DialogDescription>Só é possível excluir perfis sem usuários vinculados.</DialogDescription>
        </DialogHeader>
        <p className="text-sm">Excluir <strong>{deleteTarget?.name}</strong>?</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
          <Button variant="destructive" onClick={remove}><Trash2 /> Excluir</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
