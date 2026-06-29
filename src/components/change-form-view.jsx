"use client";

import { useState } from "react";
import { GitBranchPlus } from "lucide-react";
import { toast } from "sonner";
import { CrudFormLayout } from "@/components/crud-form-layout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const statusOptions = ["SOLICITADO", "ANALISE", "APROVADO", "IMPLEMENTANDO", "CONCLUIDO", "REJEITADO"];
const changeTypeLabels = { NORMAL: "Normal", STANDARD: "Padrão", EMERGENCY: "Emergencial" };
const riskLabels = { BAIXO: "Baixo", MEDIO: "Médio", ALTO: "Alto" };
const statusLabels = { SOLICITADO: "Solicitado", ANALISE: "Em análise", APROVADO: "Aprovado", IMPLEMENTANDO: "Em implementação", CONCLUIDO: "Concluído", REJEITADO: "Rejeitado" };

export function ChangeFormView({ item, branches = [], defaultBranchId = "", users, onCancel, onSaved }) {
  const [form, setForm] = useState({
    title: item?.title || "",
    description: item?.description || "",
    changeType: item?.change_type || "NORMAL",
    risk: item?.risk || "MEDIO",
    status: item?.status || "SOLICITADO",
    branchId: item?.branch_id || defaultBranchId || branches[0]?.id || "",
    plannedStart: item?.planned_start?.slice(0, 16) || "",
    plannedEnd: item?.planned_end?.slice(0, 16) || "",
    assigneeId: item?.assignee_id || "none",
    approverId: item?.approver_id || "none",
  });
  const [submitting, setSubmitting] = useState(false);
  const staff = users.filter((u) => u.active);

  async function submit(event) {
    event.preventDefault();
    if (form.title.length < 5 || form.description.length < 5) return toast.error("Título e descrição são obrigatórios.");
    if (!item && !form.branchId) return toast.error("Selecione a unidade.");
    setSubmitting(true);
    const payload = {
      title: form.title,
      description: form.description,
      changeType: form.changeType,
      risk: form.risk,
      branchId: form.branchId,
      plannedStart: form.plannedStart || null,
      plannedEnd: form.plannedEnd || null,
      assigneeId: form.assigneeId === "none" ? null : form.assigneeId,
      approverId: form.approverId === "none" ? null : form.approverId,
    };
    const response = await fetch(item ? `/api/changes/${item.id}` : "/api/changes", {
      method: item ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(item ? { ...payload, status: form.status, branchId: undefined } : payload),
    });
    const result = await response.json();
    setSubmitting(false);
    if (!response.ok) return toast.error(result.error || "Não foi possível salvar a mudança.");
    toast.success(item ? "Mudança atualizada." : "Mudança registrada.");
    onSaved?.();
    onCancel();
  }

  return <CrudFormLayout title={item ? `Mudança #${item.number}` : "Nova mudança"} description="Solicite e acompanhe mudanças controladas." onCancel={onCancel} onSubmit={submit} submitLabel={item ? "Salvar" : "Registrar mudança"} submitting={submitting} icon={GitBranchPlus}>
    {!item && branches.length > 0 && (
      <div className="sm:col-span-2"><Label htmlFor="change-branch" className="mb-2 block">Unidade</Label><Select value={form.branchId} onValueChange={(v) => setForm((c) => ({ ...c, branchId: v }))}><SelectTrigger id="change-branch" aria-label="Unidade"><SelectValue placeholder="Selecione">{(value) => branches.find((branch) => branch.id === value)?.name}</SelectValue></SelectTrigger><SelectContent>{branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}</SelectContent></Select></div>
    )}
    <div className="sm:col-span-2"><Label htmlFor="change-title" className="mb-2 block">Título</Label><Input id="change-title" value={form.title} onChange={(e) => setForm((c) => ({ ...c, title: e.target.value }))} placeholder="Ex.: Atualizar servidor de e-mail para a versão 2026.1" /></div>
    <div className="sm:col-span-2"><Label htmlFor="change-description" className="mb-2 block">Descrição</Label><Textarea id="change-description" rows={4} value={form.description} onChange={(e) => setForm((c) => ({ ...c, description: e.target.value }))} /></div>
    <div><Label htmlFor="change-type" className="mb-2 block">Tipo</Label><Select value={form.changeType} onValueChange={(v) => setForm((c) => ({ ...c, changeType: v }))}><SelectTrigger id="change-type" aria-label="Tipo"><SelectValue>{(value) => changeTypeLabels[value]}</SelectValue></SelectTrigger><SelectContent>{Object.entries(changeTypeLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
    <div><Label htmlFor="change-risk" className="mb-2 block">Risco</Label><Select value={form.risk} onValueChange={(v) => setForm((c) => ({ ...c, risk: v }))}><SelectTrigger id="change-risk" aria-label="Risco"><SelectValue>{(value) => riskLabels[value]}</SelectValue></SelectTrigger><SelectContent>{Object.entries(riskLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
    <div><Label htmlFor="change-planned-start" className="mb-2 block">Início planejado</Label><Input id="change-planned-start" type="datetime-local" value={form.plannedStart} onChange={(e) => setForm((c) => ({ ...c, plannedStart: e.target.value }))} /></div>
    <div><Label htmlFor="change-planned-end" className="mb-2 block">Fim planejado</Label><Input id="change-planned-end" type="datetime-local" value={form.plannedEnd} onChange={(e) => setForm((c) => ({ ...c, plannedEnd: e.target.value }))} /></div>
    <div><Label htmlFor="change-assignee" className="mb-2 block">Responsável</Label><Select value={form.assigneeId} onValueChange={(v) => setForm((c) => ({ ...c, assigneeId: v }))}><SelectTrigger id="change-assignee" aria-label="Responsável"><SelectValue placeholder="Nenhum">{(value) => value === "none" ? "Nenhum" : staff.find((user) => user.id === value)?.name}</SelectValue></SelectTrigger><SelectContent><SelectItem value="none">Nenhum</SelectItem>{staff.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent></Select></div>
    <div><Label htmlFor="change-approver" className="mb-2 block">Aprovador</Label><Select value={form.approverId} onValueChange={(v) => setForm((c) => ({ ...c, approverId: v }))}><SelectTrigger id="change-approver" aria-label="Aprovador"><SelectValue placeholder="Nenhum">{(value) => value === "none" ? "Nenhum" : staff.find((user) => user.id === value)?.name}</SelectValue></SelectTrigger><SelectContent><SelectItem value="none">Nenhum</SelectItem>{staff.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent></Select></div>
    {item && <div><Label htmlFor="change-status" className="mb-2 block">Status</Label><Select value={form.status} onValueChange={(v) => setForm((c) => ({ ...c, status: v }))}><SelectTrigger id="change-status" aria-label="Status"><SelectValue>{(value) => statusLabels[value]}</SelectValue></SelectTrigger><SelectContent>{statusOptions.map((s) => <SelectItem key={s} value={s}>{statusLabels[s]}</SelectItem>)}</SelectContent></Select></div>}
  </CrudFormLayout>;
}
