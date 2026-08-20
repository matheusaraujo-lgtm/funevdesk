"use client";

import { useEffect, useMemo, useState } from "react";
import { Repeat } from "lucide-react";
import { toast } from "sonner";
import { CrudFormLayout } from "@/components/crud-form-layout";
import { RichTextEditor } from "@/components/rich-text-editor";
import { SearchableSelect } from "@/components/searchable-select";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { isRichTextEmpty } from "@/lib/rich-text";
import { toDatetimeLocalValue as toLocalInputValue } from "@/lib/utils";

const UNIT_LABELS = { DAYS: "dia(s)", WEEKS: "semana(s)", MONTHS: "mês(es)" };
const PRIORITY_LABELS = { BAIXA: "Baixa", MEDIA: "Média", ALTA: "Alta", CRITICA: "Crítica" };

function emptyForm(defaultBranchId) {
  return {
    branchId: defaultBranchId || "",
    title: "",
    description: "",
    ticketTypeId: "",
    priority: "MEDIA",
    assigneeId: "",
    teamId: "",
    recurrenceUnit: "MONTHS",
    recurrenceInterval: 1,
    startAt: toLocalInputValue(new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()),
    active: true,
  };
}

export function RecurringTicketFormView({ item, branches = [], catalog = [], users = [], defaultBranchId, onCancel, onSaved }) {
  const [form, setForm] = useState(() => item ? {
    branchId: item.branch_id,
    title: item.title,
    description: item.description,
    ticketTypeId: item.ticket_type_id,
    priority: item.priority || "MEDIA",
    assigneeId: item.assignee_id || "",
    teamId: item.team_id || "",
    recurrenceUnit: item.recurrence_unit,
    recurrenceInterval: item.recurrence_interval,
    startAt: toLocalInputValue(item.next_run_at),
    active: Boolean(item.active),
  } : emptyForm(defaultBranchId));
  const [submitting, setSubmitting] = useState(false);
  const [teams, setTeams] = useState([]);

  useEffect(() => {
    if (!form.branchId) return;
    fetch(`/api/teams?branchId=${encodeURIComponent(form.branchId)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { teams: [] }))
      .then((data) => setTeams(data.teams || []))
      .catch(() => setTeams([]));
  }, [form.branchId]);

  const typeOptions = useMemo(
    () => catalog.filter((type) => type.active && (type.allBranches || (type.branchIds || []).includes(form.branchId))),
    [catalog, form.branchId]
  );
  const technicians = useMemo(() => users.filter((u) => u.active && (u.role === "ADMIN" || u.role === "TECHNICIAN")), [users]);
  const assigneeOptions = useMemo(
    () => [{ value: "", label: "Sem responsável fixo" }, ...technicians.map((u) => ({ value: u.id, label: u.name }))],
    [technicians]
  );

  async function submit(event) {
    event.preventDefault();
    if (!form.branchId) return toast.error("Selecione a unidade.");
    if (form.title.trim().length < 3) return toast.error("Informe um título.");
    if (isRichTextEmpty(form.description)) return toast.error("Descreva o chamado que será gerado.");
    if (!form.ticketTypeId) return toast.error("Selecione o tipo de chamado.");
    if (!form.startAt) return toast.error("Defina a data/hora da primeira execução.");
    const interval = Number(form.recurrenceInterval);
    if (!Number.isInteger(interval) || interval < 1) return toast.error("Intervalo de recorrência inválido.");

    setSubmitting(true);
    const payload = {
      branchId: form.branchId,
      title: form.title.trim(),
      description: form.description,
      ticketTypeId: form.ticketTypeId,
      priority: form.priority,
      assigneeId: form.assigneeId || null,
      teamId: form.teamId || null,
      recurrenceUnit: form.recurrenceUnit,
      recurrenceInterval: interval,
      active: form.active,
      ...(item ? { nextRunAt: new Date(form.startAt).toISOString() } : { startAt: new Date(form.startAt).toISOString() }),
    };
    const response = await fetch(item ? `/api/recurring-tickets/${item.id}` : "/api/recurring-tickets", {
      method: item ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    setSubmitting(false);
    if (!response.ok) return toast.error(result.error || "Não foi possível salvar.");
    toast.success(item ? "Modelo atualizado." : "Chamado recorrente criado.");
    onSaved?.();
    onCancel();
  }

  return (
    <CrudFormLayout
      title={item ? "Editar chamado recorrente" : "Novo chamado recorrente"}
      description="Defina o modelo uma vez — o sistema abre o chamado sozinho no intervalo configurado."
      onCancel={onCancel}
      onSubmit={submit}
      submitLabel={item ? "Salvar" : "Criar modelo"}
      submitting={submitting}
      icon={Repeat}
    >
      <div><p className="mb-2 text-sm font-medium">Unidade</p>
        <Select value={form.branchId} onValueChange={(v) => setForm((f) => ({ ...f, branchId: v, teamId: "" }))}>
          <SelectTrigger><SelectValue placeholder="Selecione...">{(v) => branches.find((b) => b.id === v)?.name}</SelectValue></SelectTrigger>
          <SelectContent>{branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div><p className="mb-2 text-sm font-medium">Tipo de chamado</p>
        <Select value={form.ticketTypeId} onValueChange={(v) => setForm((f) => ({ ...f, ticketTypeId: v }))}>
          <SelectTrigger><SelectValue placeholder="Selecione...">{(v) => typeOptions.find((t) => t.id === v)?.name}</SelectValue></SelectTrigger>
          <SelectContent>{typeOptions.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <div className="sm:col-span-2"><p className="mb-2 text-sm font-medium">Título do chamado</p><Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Ex.: Manutenção preventiva do gerador" /></div>
      <div className="sm:col-span-2">
        <p className="mb-2 text-sm font-medium">Descrição</p>
        <RichTextEditor value={form.description} onChange={(value) => setForm((f) => ({ ...f, description: value }))} minHeight="120px" placeholder="O que deve ser feito nesse chamado?" />
      </div>

      <div><p className="mb-2 text-sm font-medium">Prioridade</p>
        <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v }))}>
          <SelectTrigger><SelectValue>{(v) => PRIORITY_LABELS[v]}</SelectValue></SelectTrigger>
          <SelectContent>{Object.entries(PRIORITY_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div><p className="mb-2 text-sm font-medium">Equipe (opcional)</p>
        <Select value={form.teamId || "none"} onValueChange={(v) => setForm((f) => ({ ...f, teamId: v === "none" ? "" : v }))}>
          <SelectTrigger><SelectValue placeholder="Nenhuma">{(v) => v === "none" ? "Nenhuma" : teams.find((t) => t.id === v)?.name}</SelectValue></SelectTrigger>
          <SelectContent><SelectItem value="none">Nenhuma</SelectItem>{teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="sm:col-span-2">
        <p className="mb-2 text-sm font-medium">Responsável fixo (opcional)</p>
        <SearchableSelect value={form.assigneeId} onValueChange={(v) => setForm((f) => ({ ...f, assigneeId: v }))} options={assigneeOptions} placeholder="Sem responsável fixo" searchPlaceholder="Buscar técnico..." triggerClassName="h-9 w-full bg-card" />
      </div>

      <div><p className="mb-2 text-sm font-medium">Repetir a cada</p>
        <div className="flex gap-2">
          <Input type="number" min={1} max={365} value={form.recurrenceInterval} onChange={(e) => setForm((f) => ({ ...f, recurrenceInterval: e.target.value }))} className="w-20" />
          <Select value={form.recurrenceUnit} onValueChange={(v) => setForm((f) => ({ ...f, recurrenceUnit: v }))}>
            <SelectTrigger className="flex-1"><SelectValue>{(v) => UNIT_LABELS[v]}</SelectValue></SelectTrigger>
            <SelectContent>{Object.entries(UNIT_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div><p className="mb-2 text-sm font-medium">{item ? "Próxima execução" : "Primeira execução"}</p>
        <Input type="datetime-local" value={form.startAt} onChange={(e) => setForm((f) => ({ ...f, startAt: e.target.value }))} />
      </div>

      <label className="sm:col-span-2 flex cursor-pointer items-center gap-2 rounded-md border bg-card px-3 py-2.5">
        <Checkbox checked={form.active} onCheckedChange={(v) => setForm((f) => ({ ...f, active: Boolean(v) }))} />
        <span className="text-sm">Ativo — abre os chamados automaticamente conforme o intervalo</span>
      </label>
    </CrudFormLayout>
  );
}
