"use client";

import { useCallback, useState } from "react";
import { AlertCircle, ArrowRight, Pencil, Plus, RefreshCw, Trash2, Workflow } from "lucide-react";
import { useReloadableData } from "@/lib/use-reloadable-data";
import { toast } from "sonner";
import { ListLoadingSkeleton } from "@/components/list-loading-skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ANY = "__any";
const priorityLabels = { CRITICA: "Crítica", ALTA: "Alta", MEDIA: "Média", BAIXA: "Baixa" };
const kindLabels = { INCIDENTE: "Incidente", REQUISICAO: "Requisição" };

const emptyForm = { name: "", priority: ANY, kind: ANY, ticketTypeId: ANY, category: ANY, teamId: ANY, assigneeId: ANY };

export function AutomationsView() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const { loading, reload: load } = useReloadableData(useCallback(async () => {
    setError(false);
    try {
      const response = await fetch("/api/automations", { cache: "no-store" });
      if (!response.ok) throw new Error("failed");
      setData(await response.json());
    } catch {
      setError(true);
      setData(null);
    }
  }, []));

  function openNew() {
    setEditingId(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function openEdit(rule) {
    setEditingId(rule.id);
    setForm({
      name: rule.name,
      priority: rule.conditions.priority || ANY,
      kind: rule.conditions.kind || ANY,
      ticketTypeId: rule.conditions.ticketTypeId || ANY,
      category: rule.conditions.category || ANY,
      teamId: rule.actions.teamId || ANY,
      assigneeId: rule.actions.assigneeId || ANY,
    });
    setOpen(true);
  }

  async function submit(event) {
    event.preventDefault();
    if (form.name.trim().length < 2) return toast.error("Dê um nome à regra.");
    const conditions = pick({ priority: form.priority, kind: form.kind, ticketTypeId: form.ticketTypeId, category: form.category });
    const actions = pick({ teamId: form.teamId, assigneeId: form.assigneeId });
    if (!Object.keys(actions).length) return toast.error("Defina ao menos uma ação (equipe ou responsável).");
    setSaving(true);
    const url = editingId ? `/api/automations/${editingId}` : "/api/automations";
    const response = await fetch(url, {
      method: editingId ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: form.name.trim(), conditions, actions }),
    });
    const result = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) return toast.error(result.error || "Não foi possível salvar a regra.");
    toast.success(editingId ? "Regra atualizada." : "Regra criada.");
    setOpen(false);
    load();
  }

  async function toggleActive(rule) {
    const response = await fetch(`/api/automations/${rule.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active: !rule.active }),
    });
    if (!response.ok) return toast.error("Não foi possível alterar a regra.");
    load();
  }

  async function remove(rule) {
    const response = await fetch(`/api/automations/${rule.id}`, { method: "DELETE" });
    if (!response.ok) return toast.error("Não foi possível excluir a regra.");
    toast.success("Regra excluída.");
    load();
  }

  const header = (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/[0.07] via-card to-secondary/25 px-5 py-5 ring-1 ring-foreground/10 sm:px-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-start gap-3.5">
          <span className="hidden size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm sm:flex"><Workflow className="size-5" /></span>
          <div>
            <h1 className="page-title text-[26px]">Automações</h1>
            <p className="page-copy max-w-lg">Regras de roteamento aplicadas à abertura do chamado — atribuem equipe ou responsável conforme prioridade, tipo ou categoria.</p>
          </div>
        </div>
        {data && <Button onClick={openNew}><Plus /> Nova regra</Button>}
      </div>
    </div>
  );

  if (loading) return <div className="space-y-5 pb-6">{header}<ListLoadingSkeleton rows={5} /></div>;

  if (error) return (
    <div className="space-y-5 pb-6">
      {header}
      <Card className="rounded-2xl border-0 shadow-none ring-1 ring-foreground/10"><CardContent className="flex flex-col items-center gap-3 p-10 text-center">
        <div className="grid size-12 place-items-center rounded-xl bg-destructive/10 text-destructive"><AlertCircle className="size-6" /></div>
        <p className="font-heading text-base font-bold">Não foi possível carregar as automações</p>
        <Button onClick={load}><RefreshCw /> Tentar novamente</Button>
      </CardContent></Card>
    </div>
  );

  const { rules, teams, ticketTypes, technicians, categories } = data;
  const teamName = (id) => teams.find((t) => t.id === id)?.name || "equipe";
  const typeName = (id) => ticketTypes.find((t) => t.id === id)?.name || id;
  const userName = (id) => technicians.find((u) => u.id === id)?.name || "responsável";

  return (
    <div className="space-y-5 pb-6">
      {header}

      {rules.length === 0 ? (
        <Card className="rounded-2xl border-0 shadow-none ring-1 ring-foreground/10"><CardContent className="flex flex-col items-center gap-3 p-10 text-center">
          <div className="grid size-12 place-items-center rounded-xl bg-primary/10 text-primary"><Workflow className="size-6" /></div>
          <div>
            <p className="font-heading text-base font-bold">Nenhuma regra de automação</p>
            <p className="mt-1 text-sm text-muted-foreground">Crie regras para rotear chamados automaticamente assim que forem abertos.</p>
          </div>
          <Button onClick={openNew}><Plus /> Nova regra</Button>
        </CardContent></Card>
      ) : (
        <div className="grid gap-3">
          {rules.map((rule) => {
            const conds = describeConditions(rule.conditions, { typeName });
            return (
              <Card key={rule.id} className="rounded-2xl border-0 shadow-none ring-1 ring-foreground/10">
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-heading text-[15px] font-semibold">{rule.name}</p>
                      <Badge variant={rule.active ? "success" : "muted"}>{rule.active ? "Ativa" : "Inativa"}</Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="text-muted-foreground">Se</span>
                      {conds.length ? conds.map((c, i) => <Badge key={i} variant="outline" className="font-normal">{c}</Badge>) : <Badge variant="outline" className="font-normal">qualquer chamado</Badge>}
                      <ArrowRight className="size-3.5 text-muted-foreground" />
                      {rule.actions.teamId && <Badge variant="secondary">→ equipe {teamName(rule.actions.teamId)}</Badge>}
                      {rule.actions.assigneeId && <Badge variant="secondary">→ {userName(rule.actions.assigneeId)}</Badge>}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button variant="outline" size="sm" onClick={() => toggleActive(rule)}>{rule.active ? "Desativar" : "Ativar"}</Button>
                    <Button variant="ghost" size="icon" className="size-8" aria-label="Editar regra" onClick={() => openEdit(rule)}><Pencil className="size-4" /></Button>
                    <Button variant="ghost" size="icon" className="size-8 text-destructive" aria-label="Excluir regra" onClick={() => remove(rule)}><Trash2 className="size-4" /></Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar regra" : "Nova regra de automação"}</DialogTitle>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={submit}>
            <div className="grid gap-1.5">
              <Label htmlFor="automation-name">Nome da regra</Label>
              <Input id="automation-name" value={form.name} onChange={(event) => setForm((f) => ({ ...f, name: event.target.value }))} placeholder="Ex.: Chamados críticos para o N2" />
            </div>

            <div className="grid gap-2 rounded-lg border border-border/60 bg-muted/20 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Condições (todas precisam casar)</p>
              <FormSelect label="Prioridade" value={form.priority} onChange={(v) => setForm((f) => ({ ...f, priority: v }))} anyLabel="Qualquer" options={Object.entries(priorityLabels).map(([code, label]) => ({ value: code, label }))} />
              <FormSelect label="Tipo de chamado" value={form.ticketTypeId} onChange={(v) => setForm((f) => ({ ...f, ticketTypeId: v }))} anyLabel="Qualquer" options={ticketTypes.map((t) => ({ value: t.id, label: t.name }))} />
              <FormSelect label="Categoria" value={form.category} onChange={(v) => setForm((f) => ({ ...f, category: v }))} anyLabel="Qualquer" options={categories.map((c) => ({ value: c, label: c }))} />
            </div>

            <div className="grid gap-2 rounded-lg border border-border/60 bg-muted/20 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Ações (defina ao menos uma)</p>
              <FormSelect label="Atribuir à equipe" value={form.teamId} onChange={(v) => setForm((f) => ({ ...f, teamId: v }))} anyLabel="Não alterar" options={teams.map((t) => ({ value: t.id, label: t.name }))} />
              <FormSelect label="Atribuir ao responsável" value={form.assigneeId} onChange={(v) => setForm((f) => ({ ...f, assigneeId: v }))} anyLabel="Não alterar" options={technicians.map((u) => ({ value: u.id, label: u.name }))} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>{saving ? "Salvando..." : editingId ? "Salvar" : "Criar regra"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FormSelect({ label, value, onChange, anyLabel, options }) {
  const all = [{ value: ANY, label: anyLabel }, ...options];
  const labelFor = (current) => all.find((option) => option.value === current)?.label ?? anyLabel;
  return (
    <div className="grid grid-cols-[120px_1fr] items-center gap-2">
      <Label className="text-xs font-normal text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 bg-card"><SelectValue placeholder={anyLabel}>{(current) => labelFor(current)}</SelectValue></SelectTrigger>
        <SelectContent>
          {all.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function pick(obj) {
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value && value !== ANY) out[key] = value;
  }
  return out;
}

function describeConditions(conditions, { typeName }) {
  const parts = [];
  if (conditions.priority) parts.push(`prioridade ${priorityLabels[conditions.priority] || conditions.priority}`);
  if (conditions.kind) parts.push(kindLabels[conditions.kind] || conditions.kind);
  if (conditions.ticketTypeId) parts.push(`tipo ${typeName(conditions.ticketTypeId)}`);
  if (conditions.category) parts.push(`categoria ${conditions.category}`);
  return parts;
}
