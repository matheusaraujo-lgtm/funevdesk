"use client";

import { useState } from "react";
import { FolderKanban } from "lucide-react";
import { toast } from "sonner";
import { CrudFormLayout } from "@/components/crud-form-layout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const priorityLabels = { BAIXA: "Baixa", MEDIA: "Média", ALTA: "Alta", CRITICA: "Crítica" };
const statusLabels = { PLANEJAMENTO: "Planejamento", EM_ANDAMENTO: "Em andamento", PAUSADO: "Pausado", PENDENTE: "Pendente", CONCLUIDO: "Concluído", CANCELADO: "Cancelado" };
const statusOptions = Object.keys(statusLabels);

export function ProjectFormView({ item, branches = [], defaultBranchId = "", users, onCancel, onSaved }) {
  const [form, setForm] = useState({
    name: item?.name || "",
    description: item?.description || "",
    priority: item?.priority || "MEDIA",
    status: item?.status || "PLANEJAMENTO",
    branchId: item?.branch_id || defaultBranchId || branches[0]?.id || "",
    startDate: item?.start_date?.slice(0, 10) || "",
    dueDate: item?.due_date?.slice(0, 10) || "",
    ownerId: item?.owner_id || "none",
    pendingReason: item?.pending_reason || "",
  });
  const [submitting, setSubmitting] = useState(false);
  const staff = users.filter((u) => u.active);

  async function submit(event) {
    event.preventDefault();
    if (form.name.trim().length < 3) return toast.error("Informe o nome do projeto.");
    if (!item && !form.branchId) return toast.error("Selecione a unidade.");
    if (item && form.status === "PENDENTE" && !form.pendingReason.trim()) return toast.error("Informe o motivo da pendência.");
    setSubmitting(true);
    const payload = {
      name: form.name,
      description: form.description,
      priority: form.priority,
      branchId: form.branchId,
      startDate: form.startDate || null,
      dueDate: form.dueDate || null,
      ownerId: form.ownerId === "none" ? null : form.ownerId,
    };
    const response = await fetch(item ? `/api/projects/${item.id}` : "/api/projects", {
      method: item ? "PUT" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(item ? { ...payload, status: form.status, pendingReason: form.pendingReason || null, branchId: undefined } : payload),
    });
    const result = await response.json();
    setSubmitting(false);
    if (!response.ok) return toast.error(result.error || "Não foi possível salvar o projeto.");
    toast.success(item ? "Projeto atualizado." : "Projeto criado.");
    onSaved?.();
    onCancel();
  }

  return <CrudFormLayout title={item ? `Editar ${item.name}` : "Novo projeto"} description="Planeje o projeto e defina responsável e prazo." onCancel={onCancel} onSubmit={submit} submitLabel={item ? "Salvar" : "Criar projeto"} submitting={submitting} icon={FolderKanban}>
    {!item && branches.length > 0 && (
      <div className="sm:col-span-2"><Label htmlFor="project-branch" className="mb-2 block">Unidade</Label><Select value={form.branchId} onValueChange={(v) => setForm((c) => ({ ...c, branchId: v }))}><SelectTrigger id="project-branch" aria-label="Unidade"><SelectValue placeholder="Selecione">{(value) => branches.find((branch) => branch.id === value)?.name}</SelectValue></SelectTrigger><SelectContent>{branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}</SelectContent></Select></div>
    )}
    <div className="sm:col-span-2"><Label htmlFor="project-name" className="mb-2 block">Nome do projeto</Label><Input id="project-name" value={form.name} onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))} placeholder="Ex.: Migração do parque de notebooks" /></div>
    <div className="sm:col-span-2"><Label htmlFor="project-description" className="mb-2 block">Descrição</Label><Textarea id="project-description" rows={4} value={form.description} onChange={(e) => setForm((c) => ({ ...c, description: e.target.value }))} placeholder="Objetivo, escopo e principais entregas" /></div>
    <div><Label htmlFor="project-priority" className="mb-2 block">Prioridade</Label><Select value={form.priority} onValueChange={(v) => setForm((c) => ({ ...c, priority: v }))}><SelectTrigger id="project-priority" aria-label="Prioridade"><SelectValue>{(value) => priorityLabels[value]}</SelectValue></SelectTrigger><SelectContent>{Object.entries(priorityLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
    <div><Label htmlFor="project-owner" className="mb-2 block">Responsável</Label><Select value={form.ownerId} onValueChange={(v) => setForm((c) => ({ ...c, ownerId: v }))}><SelectTrigger id="project-owner" aria-label="Responsável"><SelectValue placeholder="Nenhum">{(value) => value === "none" ? "Nenhum" : staff.find((user) => user.id === value)?.name}</SelectValue></SelectTrigger><SelectContent><SelectItem value="none">Nenhum</SelectItem>{staff.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent></Select></div>
    <div><Label htmlFor="project-start" className="mb-2 block">Início previsto</Label><Input id="project-start" type="date" value={form.startDate} onChange={(e) => setForm((c) => ({ ...c, startDate: e.target.value }))} /></div>
    <div><Label htmlFor="project-due" className="mb-2 block">Prazo final</Label><Input id="project-due" type="date" value={form.dueDate} onChange={(e) => setForm((c) => ({ ...c, dueDate: e.target.value }))} /></div>
    {item && <div><Label htmlFor="project-status" className="mb-2 block">Status</Label><Select value={form.status} onValueChange={(v) => setForm((c) => ({ ...c, status: v }))}><SelectTrigger id="project-status" aria-label="Status"><SelectValue>{(value) => statusLabels[value]}</SelectValue></SelectTrigger><SelectContent>{statusOptions.map((s) => <SelectItem key={s} value={s}>{statusLabels[s]}</SelectItem>)}</SelectContent></Select></div>}
    {item && form.status === "PENDENTE" && (
      <div className="sm:col-span-2"><Label htmlFor="project-pending-reason" className="mb-2 block">Motivo da pendência</Label><Textarea id="project-pending-reason" rows={3} value={form.pendingReason} onChange={(e) => setForm((c) => ({ ...c, pendingReason: e.target.value }))} placeholder="O que está bloqueando o andamento do projeto?" /></div>
    )}
  </CrudFormLayout>;
}
