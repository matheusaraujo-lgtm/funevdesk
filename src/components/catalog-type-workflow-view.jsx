"use client";

import { useEffect, useState } from "react";
import { Settings2 } from "lucide-react";
import { toast } from "sonner";
import { CrudFormLayout } from "@/components/crud-form-layout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const approvalModeLabels = { SELECT: "Solicitante escolhe o aprovador", FIXED: "Aprovador fixo (pré-definido)" };

export function CatalogTypeWorkflowView({ ticketType, users, termTemplates, onCancel, onSaved }) {
  const [form, setForm] = useState({
    requiresApproval: ticketType.requiresApproval || false,
    approvalMode: ticketType.approvalMode || "SELECT",
    defaultApproverId: ticketType.defaultApproverId || "none",
    requiresTerm: ticketType.requiresTerm || false,
    termTemplateId: ticketType.termTemplateId || "none",
  });
  const [submitting, setSubmitting] = useState(false);
  const approvers = users.filter((u) => u.active && u.role !== "EMPLOYEE");

  useEffect(() => {
    // Ressincroniza o formulário de workflow quando o tipo de chamado muda.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm({
      requiresApproval: ticketType.requiresApproval || false,
      approvalMode: ticketType.approvalMode || "SELECT",
      defaultApproverId: ticketType.defaultApproverId || "none",
      requiresTerm: ticketType.requiresTerm || false,
      termTemplateId: ticketType.termTemplateId || "none",
    });
  }, [ticketType]);

  async function submit(event) {
    event.preventDefault();
    setSubmitting(true);
    const response = await fetch(`/api/catalog/${ticketType.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        requiresApproval: form.requiresApproval,
        approvalMode: form.requiresApproval ? form.approvalMode : "NONE",
        defaultApproverId: form.approvalMode === "FIXED" && form.defaultApproverId !== "none" ? form.defaultApproverId : null,
        requiresTerm: form.requiresTerm,
        termTemplateId: form.requiresTerm && form.termTemplateId !== "none" ? form.termTemplateId : null,
      }),
    });
    const result = await response.json();
    setSubmitting(false);
    if (!response.ok) return toast.error(result.error || "Não foi possível salvar.");
    toast.success("Configuração atualizada.");
    onSaved?.();
    onCancel();
  }

  return <CrudFormLayout title={`Fluxo · ${ticketType.name}`} description="Aprovação e termo de equipamento para este tipo de chamado." onCancel={onCancel} onSubmit={submit} submitLabel="Salvar configuração" submitting={submitting} icon={Settings2}>
    <div className="sm:col-span-2 space-y-3 rounded-xl border p-4">
      <label className="flex items-center gap-2 text-sm font-medium"><Checkbox checked={form.requiresApproval} onCheckedChange={(v) => setForm((c) => ({ ...c, requiresApproval: Boolean(v) }))} />Exigir aprovação antes do atendimento</label>
      {form.requiresApproval && <>
        <div><p className="mb-2 text-sm font-medium">Modo de aprovação</p><Select value={form.approvalMode} onValueChange={(v) => setForm((c) => ({ ...c, approvalMode: v }))}><SelectTrigger><SelectValue>{(value) => approvalModeLabels[value]}</SelectValue></SelectTrigger><SelectContent>{Object.entries(approvalModeLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
        {form.approvalMode === "FIXED" && <div><p className="mb-2 text-sm font-medium">Aprovador padrão</p><Select value={form.defaultApproverId} onValueChange={(v) => setForm((c) => ({ ...c, defaultApproverId: v }))}><SelectTrigger><SelectValue placeholder="Selecione">{(value) => value === "none" ? "Selecione..." : approvers.find((user) => user.id === value)?.name}</SelectValue></SelectTrigger><SelectContent><SelectItem value="none">Selecione...</SelectItem>{approvers.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent></Select></div>}
      </>}
    </div>
    <div className="sm:col-span-2 space-y-3 rounded-xl border p-4">
      <label className="flex items-center gap-2 text-sm font-medium"><Checkbox checked={form.requiresTerm} onCheckedChange={(v) => setForm((c) => ({ ...c, requiresTerm: Boolean(v) }))} />Exigir termo de equipamento no chamado</label>
      {form.requiresTerm && <div><p className="mb-2 text-sm font-medium">Modelo de termo</p><Select value={form.termTemplateId} onValueChange={(v) => setForm((c) => ({ ...c, termTemplateId: v }))}><SelectTrigger><SelectValue placeholder="Selecione o modelo">{(value) => value === "none" ? "Selecione..." : termTemplates.find((template) => template.id === value)?.name}</SelectValue></SelectTrigger><SelectContent><SelectItem value="none">Selecione...</SelectItem>{termTemplates.filter((t) => t.active).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select><p className="mt-2 text-xs text-muted-foreground">O solicitante assina o termo na abertura ou nos detalhes do chamado (equipamento obrigatório).</p></div>}
    </div>
    <div className="sm:col-span-2"><Button type="button" variant="outline" onClick={onCancel}>Voltar para tipos</Button></div>
  </CrudFormLayout>;
}
