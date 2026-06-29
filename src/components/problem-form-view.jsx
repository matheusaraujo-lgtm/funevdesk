"use client";

import { useState } from "react";
import { AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { CrudFormLayout } from "@/components/crud-form-layout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const statusOptions = ["ABERTO", "ANALISE", "CONHECIDO", "RESOLVIDO"];
const statusLabels = { ABERTO: "Aberto", ANALISE: "Em análise", CONHECIDO: "Erro conhecido", RESOLVIDO: "Resolvido" };

export function ProblemFormView({ item, branches = [], defaultBranchId = "", users, onCancel, onSaved }) {
  const [form, setForm] = useState({
    title: item?.title || "",
    description: item?.description || "",
    workaround: item?.workaround || "",
    rootCause: item?.root_cause || "",
    status: item?.status || "ABERTO",
    branchId: item?.branch_id || defaultBranchId || branches[0]?.id || "",
    assigneeId: item?.assignee_id || "none",
  });
  const [submitting, setSubmitting] = useState(false);
  const technicians = users.filter((u) => u.active && (u.role === "ADMIN" || u.role === "TECHNICIAN"));

  async function submit(event) {
    event.preventDefault();
    if (form.title.length < 5 || form.description.length < 5) return toast.error("Título e descrição são obrigatórios.");
    if (!item && !form.branchId) return toast.error("Selecione a unidade.");
    setSubmitting(true);
    const payload = { title: form.title, description: form.description, workaround: form.workaround, rootCause: form.rootCause, status: form.status, assigneeId: form.assigneeId === "none" ? null : form.assigneeId, branchId: form.branchId };
    const response = await fetch(item ? `/api/problems/${item.id}` : "/api/problems", { method: item ? "PUT" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json();
    setSubmitting(false);
    if (!response.ok) return toast.error(result.error || "Não foi possível salvar o problema.");
    toast.success(item ? "Problema atualizado." : "Problema registrado.");
    onSaved?.();
    onCancel();
  }

  return <CrudFormLayout title={item ? `Problema #${item.number}` : "Novo problema"} description="Registre causa raiz e contorno conhecido." onCancel={onCancel} onSubmit={submit} submitLabel={item ? "Salvar" : "Registrar"} submitting={submitting} icon={AlertCircle}>
    {!item && branches.length > 0 && (
      <div className="sm:col-span-2"><Label htmlFor="problem-branch" className="mb-2 block">Unidade</Label><Select value={form.branchId} onValueChange={(v) => setForm((c) => ({ ...c, branchId: v }))}><SelectTrigger id="problem-branch" aria-label="Unidade"><SelectValue placeholder="Selecione">{(value) => branches.find((branch) => branch.id === value)?.name}</SelectValue></SelectTrigger><SelectContent>{branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}</SelectContent></Select></div>
    )}
    <div className="sm:col-span-2"><Label htmlFor="problem-title" className="mb-2 block">Título</Label><Input id="problem-title" value={form.title} onChange={(e) => setForm((c) => ({ ...c, title: e.target.value }))} /></div>
    <div className="sm:col-span-2"><Label htmlFor="problem-description" className="mb-2 block">Descrição</Label><Textarea id="problem-description" rows={4} value={form.description} onChange={(e) => setForm((c) => ({ ...c, description: e.target.value }))} /></div>
    {item && <div><Label htmlFor="problem-status" className="mb-2 block">Status</Label><Select value={form.status} onValueChange={(v) => setForm((c) => ({ ...c, status: v }))}><SelectTrigger id="problem-status" aria-label="Status"><SelectValue>{(value) => statusLabels[value]}</SelectValue></SelectTrigger><SelectContent>{statusOptions.map((s) => <SelectItem key={s} value={s}>{statusLabels[s]}</SelectItem>)}</SelectContent></Select></div>}
    <div><Label htmlFor="problem-assignee" className="mb-2 block">Responsável</Label><Select value={form.assigneeId} onValueChange={(v) => setForm((c) => ({ ...c, assigneeId: v }))}><SelectTrigger id="problem-assignee" aria-label="Responsável"><SelectValue placeholder="Nenhum">{(value) => value === "none" ? "Nenhum" : technicians.find((user) => user.id === value)?.name}</SelectValue></SelectTrigger><SelectContent><SelectItem value="none">Nenhum</SelectItem>{technicians.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent></Select></div>
    <div className="sm:col-span-2"><Label htmlFor="problem-workaround" className="mb-2 block">Contorno (workaround)</Label><Textarea id="problem-workaround" value={form.workaround} onChange={(e) => setForm((c) => ({ ...c, workaround: e.target.value }))} /></div>
    {item && <div className="sm:col-span-2"><Label htmlFor="problem-root-cause" className="mb-2 block">Causa raiz</Label><Textarea id="problem-root-cause" value={form.rootCause} onChange={(e) => setForm((c) => ({ ...c, rootCause: e.target.value }))} /></div>}
  </CrudFormLayout>;
}
