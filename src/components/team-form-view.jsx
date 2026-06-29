"use client";

import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { toast } from "sonner";
import { CrudFormLayout } from "@/components/crud-form-layout";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export function TeamFormView({ teamId, branches, users, onCancel, onSaved }) {
  const [form, setForm] = useState({ name: "", description: "", branchId: "none", memberIds: [] });
  const [submitting, setSubmitting] = useState(false);
  const technicians = users.filter((u) => u.active && (u.role === "ADMIN" || u.role === "TECHNICIAN"));

  useEffect(() => {
    if (!teamId) return;
    fetch(`/api/teams/${teamId}`, { cache: "no-store" }).then(async (r) => {
      if (!r.ok) return;
      const team = (await r.json()).team;
      if (team) setForm({ name: team.name, description: team.description || "", branchId: team.branch_id || "none", memberIds: team.memberIds || [] });
    });
  }, [teamId]);

  function toggleMember(userId) {
    setForm((current) => ({
      ...current,
      memberIds: current.memberIds.includes(userId) ? current.memberIds.filter((id) => id !== userId) : [...current.memberIds, userId],
    }));
  }

  async function submit(event) {
    event.preventDefault();
    if (!form.name.trim()) return toast.error("Informe o nome da equipe.");
    setSubmitting(true);
    const payload = { name: form.name, description: form.description, branchId: form.branchId === "none" ? null : form.branchId, memberIds: form.memberIds };
    const response = await fetch(teamId ? `/api/teams/${teamId}` : "/api/teams", { method: teamId ? "PUT" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json();
    setSubmitting(false);
    if (!response.ok) return toast.error(result.error || "Não foi possível salvar a equipe.");
    toast.success(teamId ? "Equipe atualizada." : "Equipe criada.");
    onSaved?.();
    onCancel();
  }

  return <CrudFormLayout title={teamId ? "Editar equipe" : "Nova equipe"} description="Defina fila, unidade e membros técnicos." onCancel={onCancel} onSubmit={submit} submitLabel={teamId ? "Salvar" : "Criar equipe"} submitting={submitting} icon={Users}>
    <div className="sm:col-span-2"><p className="mb-2 text-sm font-medium">Nome</p><Input value={form.name} onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))} /></div>
    <div className="sm:col-span-2"><p className="mb-2 text-sm font-medium">Descrição</p><Textarea value={form.description} onChange={(e) => setForm((c) => ({ ...c, description: e.target.value }))} /></div>
    <div><p className="mb-2 text-sm font-medium">Unidade</p><Select value={form.branchId} onValueChange={(v) => setForm((c) => ({ ...c, branchId: v }))}><SelectTrigger><SelectValue placeholder="Todas">{(value) => value === "none" ? "Todas as unidades" : branches.find((branch) => branch.id === value)?.name}</SelectValue></SelectTrigger><SelectContent><SelectItem value="none">Todas as unidades</SelectItem>{branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent></Select></div>
    <div className="sm:col-span-2"><p className="mb-2 text-sm font-medium">Membros</p><div className="grid gap-2 sm:grid-cols-2">{technicians.map((user) => <label key={user.id} className="flex items-center gap-2 rounded-lg border p-3 text-sm"><Checkbox checked={form.memberIds.includes(user.id)} onCheckedChange={() => toggleMember(user.id)} />{user.name}</label>)}</div></div>
  </CrudFormLayout>;
}
