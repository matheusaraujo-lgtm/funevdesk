"use client";

import { useEffect, useState } from "react";
import { Building2, GripVertical, Plus, Settings2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { CrudFormLayout } from "@/components/crud-form-layout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

const fieldTypeLabels = {
  TEXT: "Texto curto", TEXTAREA: "Texto longo", SELECT: "Lista de opções (única)", MULTISELECT: "Múltipla escolha", DATE: "Data",
  FILE: "Arquivo", SCREENSHOT: "Captura de tela", LOCATION: "Localização", STOCK: "Item de estoque",
};
const approvalModeLabels = { SELECT: "Solicitante escolhe aprovador", FIXED: "Aprovador fixo" };
const blankField = () => ({ label: "", fieldType: "TEXT", placeholder: "", required: false, optionsText: "" });

function mapTypeToForm(ticketType) {
  if (!ticketType) {
    return {
      name: "", description: "", kind: "INCIDENTE", category: "Sistema", categoryId: "none", defaultPriority: "MEDIA", fields: [blankField()],
      requiresApproval: false, approvalMode: "SELECT", defaultApproverId: "none", requiresTerm: false, termTemplateId: "none",
      scopeMode: "ALL", branchIds: [], targetBranchMode: "REQUESTER", targetBranchId: "none", checklist: [],
    };
  }
  return {
    name: ticketType.name || "",
    description: ticketType.description || "",
    kind: ticketType.kind || "INCIDENTE",
    category: ticketType.category || "",
    categoryId: ticketType.categoryId || ticketType.category_id || "none",
    defaultPriority: ticketType.default_priority || ticketType.defaultPriority || "MEDIA",
    requiresApproval: Boolean(ticketType.requiresApproval ?? ticketType.requires_approval),
    approvalMode: ticketType.approvalMode || ticketType.approval_mode || "SELECT",
    defaultApproverId: ticketType.defaultApproverId || ticketType.default_approver_id || "none",
    requiresTerm: Boolean(ticketType.requiresTerm ?? ticketType.requires_term),
    termTemplateId: ticketType.termTemplateId || ticketType.term_template_id || "none",
    scopeMode: ticketType.scopeMode || ticketType.scope_mode || "ALL",
    branchIds: ticketType.branchIds || [],
    targetBranchMode: ticketType.targetBranchMode || ticketType.target_branch_mode || "REQUESTER",
    targetBranchId: ticketType.targetBranchId || ticketType.target_branch_id || "none",
    fields: (ticketType.fields?.length ? ticketType.fields : [blankField()]).map((field) => ({
      id: field.id,
      label: field.label || "",
      fieldType: field.fieldType || field.field_type || "TEXT",
      placeholder: field.placeholder || "",
      required: Boolean(field.required),
      optionsText: (field.options || []).join(", "),
    })),
    checklist: (ticketType.checklist || []).map((item, index) => ({ id: item.id || `chk-${index}`, label: item.label || "" })),
  };
}

export function CatalogTypeFormView({ ticketType, branches = [], onCreateType, onSaveType, onCancel, users = [] }) {
  const isEdit = Boolean(ticketType?.id);
  const [form, setForm] = useState(() => mapTypeToForm(ticketType));
  const [termTemplates, setTermTemplates] = useState([]);
  const [categories, setCategories] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const approvers = users.filter((u) => u.active && u.role !== "EMPLOYEE");

  useEffect(() => {
    // Ressincroniza o formulário quando o tipo de chamado editado muda.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm(mapTypeToForm(ticketType));
  }, [ticketType]);

  useEffect(() => {
    fetch("/api/term-templates", { cache: "no-store" }).then(async (r) => { if (r.ok) setTermTemplates((await r.json()).templates); });
    fetch("/api/categories", { cache: "no-store" }).then(async (r) => { if (r.ok) setCategories((await r.json()).categories.filter((c) => c.active)); });
  }, []);

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const toggleBranch = (branchId) => setForm((current) => ({
    ...current,
    branchIds: current.branchIds.includes(branchId)
      ? current.branchIds.filter((id) => id !== branchId)
      : [...current.branchIds, branchId],
  }));
  const updateField = (index, key, value) => setForm((current) => ({ ...current, fields: current.fields.map((field, position) => position === index ? { ...field, [key]: value } : field) }));
  const removeField = (index) => setForm((current) => ({ ...current, fields: current.fields.filter((_, position) => position !== index) }));
  const addChecklistItem = () => setForm((current) => ({ ...current, checklist: [...current.checklist, { id: `chk-${Date.now()}-${current.checklist.length}`, label: "" }] }));
  const updateChecklistItem = (index, value) => setForm((current) => ({ ...current, checklist: current.checklist.map((item, position) => position === index ? { ...item, label: value } : item) }));
  const removeChecklistItem = (index) => setForm((current) => ({ ...current, checklist: current.checklist.filter((_, position) => position !== index) }));

  async function submit(event) {
    event.preventDefault();
    if (!form.categoryId || form.categoryId === "none") {
      return toast.error("Selecione uma categoria. Cadastre-as em Configurações → Categorias.");
    }
    setSubmitting(true);
    const payload = {
      ...form,
      categoryId: form.categoryId,
      category: categories.find((c) => c.id === form.categoryId)?.name || form.category,
      defaultApproverId: form.approvalMode === "FIXED" && form.defaultApproverId !== "none" ? form.defaultApproverId : null,
      termTemplateId: form.requiresTerm && form.termTemplateId !== "none" ? form.termTemplateId : null,
      scopeMode: form.scopeMode,
      branchIds: form.scopeMode === "SELECTED" ? form.branchIds : [],
      targetBranchMode: form.targetBranchMode,
      targetBranchId: form.targetBranchMode === "SPECIFIC" && form.targetBranchId !== "none" ? form.targetBranchId : null,
      fields: form.fields.map((field) => ({
        id: field.id,
        label: field.label,
        fieldType: field.fieldType,
        placeholder: field.placeholder,
        required: field.required,
        options: ["SELECT", "MULTISELECT", "STOCK"].includes(field.fieldType)
          ? field.optionsText.split(",").map((item) => item.trim()).filter(Boolean)
          : [],
      })),
      checklist: form.checklist.map((item) => ({ id: item.id, label: item.label.trim() })).filter((item) => item.label),
    };
    const success = isEdit ? await onSaveType(ticketType.id, payload) : await onCreateType(payload);
    setSubmitting(false);
    if (success) onCancel();
  }

  return (
    <CrudFormLayout
      title={isEdit ? "Editar tipo de chamado" : "Novo tipo de chamado"}
      description={isEdit ? "Atualize nome, campos e regras do formulário de abertura." : "Defina os campos exibidos no formulário de abertura."}
      onCancel={onCancel}
      onSubmit={submit}
      submitLabel={isEdit ? "Salvar alterações" : "Salvar tipo de chamado"}
      submitting={submitting}
      icon={Settings2}>
      <div><Label htmlFor="catalog-name" className="mb-2 block">Nome</Label><Input id="catalog-name" required value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="Ex.: Solicitação de compra" /></div>
      <div>
        <Label htmlFor="catalog-category" className="mb-2 block">Categoria</Label>
        <Select value={form.categoryId} onValueChange={(value) => {
          update("categoryId", value);
          const cat = categories.find((c) => c.id === value);
          if (cat) update("category", cat.name);
        }}>
          <SelectTrigger id="catalog-category" aria-label="Categoria"><SelectValue placeholder="Selecione a categoria">{(value) => value === "none" ? "Selecione a categoria" : categories.find((c) => c.id === value)?.name}</SelectValue></SelectTrigger>
          <SelectContent>
            {categories.length === 0
              ? <SelectItem value="none" disabled>Nenhuma categoria cadastrada</SelectItem>
              : categories.map((cat) => <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <p className="mt-1.5 text-xs text-muted-foreground">Gerencie as categorias em Configurações → Categorias.</p>
      </div>
      <div><Label htmlFor="catalog-kind" className="mb-2 block">Natureza</Label><Select value={form.kind} onValueChange={(value) => update("kind", value)}><SelectTrigger id="catalog-kind" aria-label="Natureza"><SelectValue placeholder="Natureza">{(value) => ({ INCIDENTE: "Incidente", REQUISICAO: "Requisição" }[value])}</SelectValue></SelectTrigger><SelectContent><SelectItem value="INCIDENTE">Incidente</SelectItem><SelectItem value="REQUISICAO">Requisição</SelectItem></SelectContent></Select></div>
      <div><Label htmlFor="catalog-priority" className="mb-2 block">Prioridade padrão</Label><Select value={form.defaultPriority} onValueChange={(value) => update("defaultPriority", value)}><SelectTrigger id="catalog-priority" aria-label="Prioridade padrão"><SelectValue placeholder="Prioridade">{(value) => ({ BAIXA: "Baixa", MEDIA: "Média", ALTA: "Alta", CRITICA: "Crítica" }[value])}</SelectValue></SelectTrigger><SelectContent>{["BAIXA", "MEDIA", "ALTA", "CRITICA"].map((value) => <SelectItem key={value} value={value}>{{ BAIXA: "Baixa", MEDIA: "Média", ALTA: "Alta", CRITICA: "Crítica" }[value]}</SelectItem>)}</SelectContent></Select></div>
      <div className="sm:col-span-2"><Label htmlFor="catalog-description" className="mb-2 block">Descrição</Label><Textarea id="catalog-description" value={form.description} onChange={(event) => update("description", event.target.value)} placeholder="Explique quando este tipo deve ser utilizado" /></div>
      <div className="sm:col-span-2 space-y-3 rounded-xl border p-4">
        <div className="flex items-center gap-2"><Building2 className="size-4 text-primary" /><p className="font-semibold">Unidades e roteamento</p></div>
        <p className="text-xs text-muted-foreground">Defina em quais filiais o tipo aparece e para qual fila o chamado será encaminhado ao abrir.</p>
        <div>
          <Label htmlFor="catalog-scope-mode" className="mb-2 block">Disponibilidade</Label>
          <Select value={form.scopeMode} onValueChange={(value) => update("scopeMode", value)}>
            <SelectTrigger id="catalog-scope-mode" aria-label="Disponibilidade"><SelectValue>{(value) => value === "ALL" ? "Todas as unidades" : "Somente unidades selecionadas"}</SelectValue></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todas as unidades</SelectItem>
              <SelectItem value="SELECTED">Somente unidades selecionadas</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {form.scopeMode === "SELECTED" && (
          <div className="grid gap-2 sm:grid-cols-2">
            {branches.map((branch) => (
              <label key={branch.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                <Checkbox checked={form.branchIds.includes(branch.id)} onCheckedChange={() => toggleBranch(branch.id)} />
                <span>{branch.name}</span>
                <span className="ml-auto text-[10px] uppercase text-muted-foreground">{branch.type === "MATRIZ" ? "Matriz" : "Filial"}</span>
              </label>
            ))}
          </div>
        )}
        <div>
          <Label htmlFor="catalog-target-mode" className="mb-2 block">Fila de atendimento</Label>
          <Select value={form.targetBranchMode} onValueChange={(value) => update("targetBranchMode", value)}>
            <SelectTrigger id="catalog-target-mode" aria-label="Fila de atendimento"><SelectValue>{(value) => ({ REQUESTER: "Unidade do solicitante", MATRIZ: "Matriz (empresa principal)", SPECIFIC: "Unidade específica" }[value])}</SelectValue></SelectTrigger>
            <SelectContent>
              <SelectItem value="REQUESTER">Unidade do solicitante</SelectItem>
              <SelectItem value="MATRIZ">Matriz (empresa principal)</SelectItem>
              <SelectItem value="SPECIFIC">Unidade específica</SelectItem>
            </SelectContent>
          </Select>
          <p className="mt-2 text-xs text-muted-foreground">
            {form.targetBranchMode === "MATRIZ" && "Chamados abertos em filiais serão encaminhados para a fila da matriz."}
            {form.targetBranchMode === "REQUESTER" && "O chamado permanece na fila da unidade selecionada pelo solicitante."}
            {form.targetBranchMode === "SPECIFIC" && "Todos os chamados deste tipo vão para a unidade escolhida abaixo."}
          </p>
        </div>
        {form.targetBranchMode === "SPECIFIC" && (
          <Select value={form.targetBranchId} onValueChange={(value) => update("targetBranchId", value)}>
            <SelectTrigger aria-label="Unidade de destino"><SelectValue placeholder="Unidade de destino">{(value) => value === "none" ? "Selecione..." : branches.find((branch) => branch.id === value)?.name}</SelectValue></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Selecione...</SelectItem>
              {branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>
      <div className="sm:col-span-2 space-y-3 rounded-xl border p-4">
        <p className="font-semibold">Aprovação</p>
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.requiresApproval} onCheckedChange={(v) => update("requiresApproval", Boolean(v))} />Exigir aprovação</label>
        {form.requiresApproval && <>
          <Select value={form.approvalMode} onValueChange={(v) => update("approvalMode", v)}><SelectTrigger aria-label="Modo de aprovação"><SelectValue>{(value) => approvalModeLabels[value]}</SelectValue></SelectTrigger><SelectContent>{Object.entries(approvalModeLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
          {form.approvalMode === "FIXED" && <Select value={form.defaultApproverId} onValueChange={(v) => update("defaultApproverId", v)}><SelectTrigger aria-label="Aprovador fixo"><SelectValue placeholder="Aprovador">{(value) => value === "none" ? "Selecione..." : approvers.find((user) => user.id === value)?.name}</SelectValue></SelectTrigger><SelectContent><SelectItem value="none">Selecione...</SelectItem>{approvers.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent></Select>}
        </>}
      </div>
      <div className="sm:col-span-2 space-y-3 rounded-xl border p-4">
        <p className="font-semibold">Termo de equipamento</p>
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.requiresTerm} onCheckedChange={(v) => update("requiresTerm", Boolean(v))} />Exigir assinatura de termo</label>
        {form.requiresTerm && <Select value={form.termTemplateId} onValueChange={(v) => update("termTemplateId", v)}><SelectTrigger aria-label="Modelo de termo"><SelectValue placeholder="Modelo de termo">{(value) => value === "none" ? "Selecione..." : termTemplates.find((template) => template.id === value)?.name}</SelectValue></SelectTrigger><SelectContent><SelectItem value="none">Selecione...</SelectItem>{termTemplates.filter((t) => t.active).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select>}
      </div>
      <div className="sm:col-span-2 space-y-3">
        <Separator />
        <div className="flex items-center justify-between"><div><p className="font-semibold">Campos do formulário</p><p className="text-xs text-muted-foreground">A ordem abaixo será usada na abertura. Campos já usados em chamados não podem ser removidos.</p></div><Button type="button" variant="outline" size="sm" onClick={() => update("fields", [...form.fields, blankField()])}><Plus /> Adicionar campo</Button></div>
        {form.fields.map((field, index) => (
          <div className="rounded-xl border p-4" key={field.id || `new-${index}`}>
            <div className="mb-3 flex items-center gap-2"><GripVertical className="size-4 text-muted-foreground" /><p className="text-sm font-semibold">Campo {index + 1}</p><Button type="button" variant="ghost" size="icon" className="ml-auto" disabled={form.fields.length === 1} onClick={() => removeField(index)}><Trash2 /></Button></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input required aria-label={`Nome do campo ${index + 1}`} value={field.label} onChange={(event) => updateField(index, "label", event.target.value)} placeholder="Nome do campo" />
              <Select value={field.fieldType} onValueChange={(value) => updateField(index, "fieldType", value)}><SelectTrigger aria-label={`Tipo do campo ${index + 1}`}><SelectValue placeholder="Tipo de campo">{(value) => fieldTypeLabels[value]}</SelectValue></SelectTrigger><SelectContent>{Object.entries(fieldTypeLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
              <Input aria-label={`Texto de orientação do campo ${index + 1}`} value={field.placeholder} onChange={(event) => updateField(index, "placeholder", event.target.value)} placeholder="Texto de orientação" />
              {field.fieldType === "SELECT" || field.fieldType === "MULTISELECT" || field.fieldType === "STOCK" ? (
                <Input required={field.fieldType === "SELECT" || field.fieldType === "MULTISELECT"} aria-label={`Opções do campo ${index + 1}`} value={field.optionsText} onChange={(event) => updateField(index, "optionsText", event.target.value)} placeholder={field.fieldType === "STOCK" ? "Filtro: Periféricos, Suprimentos (opcional)" : "Opção 1, Opção 2, Opção 3"} />
              ) : (
                <Button type="button" variant={field.required ? "default" : "outline"} onClick={() => updateField(index, "required", !field.required)}>{field.required ? "Campo obrigatório" : "Campo opcional"}</Button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="sm:col-span-2 space-y-3">
        <Separator />
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold">Checklist técnico</p>
            <p className="text-xs text-muted-foreground">Itens que o técnico marca durante o atendimento deste tipo de chamado (salvos no chamado).</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addChecklistItem}><Plus /> Adicionar item</Button>
        </div>
        {form.checklist.length === 0 ? (
          <p className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">Sem checklist. Adicione itens para guiar o atendimento deste tipo.</p>
        ) : (
          <div className="space-y-2">
            {form.checklist.map((item, index) => (
              <div className="flex items-center gap-2" key={item.id || `chk-${index}`}>
                <Input aria-label={`Item ${index + 1} do checklist`} value={item.label} onChange={(event) => updateChecklistItem(index, event.target.value)} placeholder={`Item ${index + 1} — ex.: Verificar conexão`} />
                <Button type="button" variant="ghost" size="icon" onClick={() => removeChecklistItem(index)}><Trash2 /></Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </CrudFormLayout>
  );
}
