"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ClipboardList, Save } from "lucide-react";
import { toast } from "sonner";
import {
  enrichTicketField,
  TicketConfiguredFieldInput,
  TicketFormField,
} from "@/components/ticket-configured-field";
import { TicketWorkflowSection } from "@/components/ticket-workflow-section";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

const defaultChecklist = [
  { id: "analyze-large", label: "Analisar arquivos > 1GB", checked: true },
  { id: "temp-cleanup", label: "Limpar temporários", checked: true },
  { id: "recycle", label: "Esvaziar lixeira", checked: false },
  { id: "validate-space", label: "Validar espaço livre", checked: false },
];

const printerChecklist = [
  { id: "paper", label: "Verificar papel na bandeja", checked: false },
  { id: "jam", label: "Verificar/remover atolamento", checked: false },
  { id: "toner", label: "Verificar nível e trocar toner", checked: false },
  { id: "restart", label: "Reiniciar a impressora", checked: false },
  { id: "network", label: "Verificar rede / SNMP", checked: false },
  { id: "service", label: "Acionar assistência técnica (se necessário)", checked: false },
];

// Chamado de monitoramento de impressora/rede (origem MONITOR sem ativo de máquina vinculado).
// Telemetria de máquina sempre traz asset_id; só impressoras/rede abrem MONITOR sem ativo.
function isPrinterTicket(ticket) {
  return ticket?.source === "MONITOR" && !ticket?.asset_id;
}

// Modelo de checklist definido no tipo de chamado (catálogo), normalizado para {id,label,checked}.
function parseTypeChecklist(json) {
  try {
    const items = json ? JSON.parse(json) : null;
    if (Array.isArray(items) && items.length) {
      return items.map((item, index) => ({ id: item.id || `chk-${index}`, label: item.label || String(item), checked: false }));
    }
  } catch { /* ignore */ }
  return null;
}

function buildFormFields(responses = []) {
  if (responses.length) return responses.map(enrichTicketField);
  return [];
}

function formTitle(ticket) {
  if (ticket?.ticket_type_name) return `Informações para o suporte`;
  if (ticket?.kind === "INCIDENTE") return "Formulário do incidente";
  return "Formulário do chamado";
}

function formSubtitle(ticket, hasFields) {
  // Só anuncia "campos específicos" quando o tipo realmente trouxe um formulário.
  if (ticket?.ticket_type_name && hasFields) return `Campos específicos de ${ticket.ticket_type_name}.`;
  if (ticket?.source === "MONITOR") return "Incidente detectado pelo monitoramento.";
  if (ticket?.kind === "INCIDENTE") return "Checklist e anotações do atendimento.";
  return null;
}

function resolveAttachment(field, attachments = []) {
  return attachments.find((item) => {
    if (field.field_id && item.field_id === field.field_id) return true;
    if (field.value_text && item.original_name === field.value_text) return true;
    if (field.field_label && item.original_name && field.field_type !== "TEXT") return item.original_name === field.value_text;
    return false;
  });
}

export function TicketIncidentForm({
  responses = [],
  attachments = [],
  ticketId,
  ticket,
  canEdit = false,
  canViewChecklist = false,
  workflow,
  collapsible = false,
}) {
  // Já vem expandida ao abrir o chamado; o usuário ainda pode recolher pelo cabeçalho.
  const [open, setOpen] = useState(true);
  const printerMode = isPrinterTicket(ticket);
  // Checklist do TIPO do chamado (configurável no catálogo) tem prioridade.
  const hasTypeChecklist = Boolean(parseTypeChecklist(ticket?.type_checklist_json));
  const [values, setValues] = useState({});
  const [checklist, setChecklist] = useState(() => (printerMode ? printerChecklist : defaultChecklist));

  const fields = useMemo(() => buildFormFields(responses), [responses]);
  // Mostra checklist quando: o tipo tem checklist, é impressora, ou incidente de máquina (com ativo).
  const showChecklist = hasTypeChecklist || printerMode || (Boolean(ticket?.asset_id) && (ticket?.source === "MONITOR" || (ticket?.kind === "INCIDENTE" && !responses.length)));
  // Checklist é interno da equipe de suporte — nunca exibido ao solicitante (usuário final).
  const checklistVisible = showChecklist && canViewChecklist;
  const hasWorkflow = workflow && (workflow.pendingApproval || workflow.requiresTerm || workflow.equipmentTerm || workflow.approvals?.length);
  const showStatusDots = !responses.length && (ticket?.source === "MONITOR" || ticket?.kind === "INCIDENTE");
  const subtitle = formSubtitle(ticket, fields.length > 0);

  useEffect(() => {
    // Ressincroniza os valores dos campos quando a definição de campos muda.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setValues(Object.fromEntries(fields.map((field) => [field.id, field.value_text || ""])));
  }, [fields]);

  // Carrega o estado salvo no banco (tickets.checklist_json); senão usa o modelo do tipo/padrão.
  useEffect(() => {
    let saved = null;
    try { saved = ticket?.checklist_json ? JSON.parse(ticket.checklist_json) : null; } catch { saved = null; }
    // Carrega o checklist salvo ou o modelo do tipo quando o chamado muda.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (Array.isArray(saved) && saved.length) { setChecklist(saved); return; }
    setChecklist(parseTypeChecklist(ticket?.type_checklist_json) || (printerMode ? printerChecklist : defaultChecklist));
  }, [ticket?.id, ticket?.checklist_json, ticket?.type_checklist_json, printerMode]);

  const [savingChecklist, setSavingChecklist] = useState(false);
  async function handleSave() {
    if (!ticketId) return;
    setSavingChecklist(true);
    const response = await fetch(`/api/tickets/${ticketId}/checklist`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ checklist }),
    });
    setSavingChecklist(false);
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      return toast.error(result.error || "Não foi possível salvar o checklist.");
    }
    toast.success("Checklist salvo no chamado.");
  }

  if (!fields.length && !hasWorkflow && !checklistVisible) {
    // Em modo recolhível (coluna lateral), não renderiza cartão vazio — evita poluição.
    if (collapsible) return null;
    return (
      <Card className="ticket-column rounded-2xl py-0 shadow-none">
        <CardHeader className="border-b py-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <ClipboardList className="size-4 text-primary" />
            {formTitle(ticket)}
          </CardTitle>
        </CardHeader>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Sem informações adicionais para este chamado.
        </CardContent>
      </Card>
    );
  }

  const titleBlock = (
    <div>
      <CardTitle className="flex items-center gap-2 text-sm font-semibold">
        <ClipboardList className="size-4 text-primary" />
        {formTitle(ticket)}
      </CardTitle>
      {subtitle && <p className="mt-1 text-left text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  );

  return (
    <Card className={cn("rounded-xl py-0 shadow-none", !collapsible && "ticket-column")}>
      <CardHeader className="space-y-0 border-b py-3">
        <div className="flex w-full items-start justify-between gap-2">
          {collapsible ? (
            <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="-mx-1 flex flex-1 items-start gap-2 rounded-md px-1 py-0.5 text-left hover:bg-muted/40">
              <ChevronDown className={cn("mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform", !open && "-rotate-90")} />
              {titleBlock}
            </button>
          ) : titleBlock}
          {canEdit && checklistVisible && open && (
            <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={handleSave} disabled={savingChecklist}>
              <Save className="size-3.5" />
              {savingChecklist ? "Salvando..." : "Salvar checklist"}
            </Button>
          )}
        </div>
      </CardHeader>

      {open && (
      <CardContent className={cn("px-4 py-4", !collapsible && "min-h-0 flex-1 overflow-y-auto")}>
        {workflow && <TicketWorkflowSection {...workflow} ticketId={ticketId} />}

        {fields.length > 0 && (
          <div className={cn("grid grid-cols-1 gap-4", !collapsible && "sm:grid-cols-2")}>
            {fields.map((field) => {
              const wide = ["TEXTAREA", "FILE", "SCREENSHOT", "STOCK"].includes(field.field_type);
              return (
                <TicketFormField
                  key={field.id}
                  label={field.field_label}
                  required={field.required}
                  className={cn(wide && !collapsible && "sm:col-span-2")}
                >
                  <TicketConfiguredFieldInput
                    field={field}
                    value={values[field.id] || ""}
                    onChange={(next) => setValues((current) => ({ ...current, [field.id]: next }))}
                    readOnly={!canEdit || Boolean(responses.length)}
                    attachment={resolveAttachment(field, attachments)}
                    showStatusDot={showStatusDots}
                    branchId={ticket?.branch_id}
                  />
                </TicketFormField>
              );
            })}
          </div>
        )}

        {checklistVisible && (
          <div className="mt-4 border-t pt-4">
            <p className="text-sm font-semibold">{hasTypeChecklist ? "Checklist do chamado" : printerMode ? "Checklist da impressora" : "Checklist técnico"}</p>
            <p className="mb-3 text-xs text-muted-foreground">Salvo no chamado — visível para toda a equipe de suporte.</p>
            <div className={cn("grid grid-cols-1 gap-2", !collapsible && "sm:grid-cols-2")}>
              {checklist.map((item) => (
                <label key={item.id} className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={item.checked}
                    onCheckedChange={() =>
                      setChecklist((current) =>
                        current.map((entry) => (entry.id === item.id ? { ...entry, checked: !entry.checked } : entry))
                      )
                    }
                    disabled={!canEdit}
                  />
                  <span className={cn(item.checked ? "text-foreground" : "text-muted-foreground")}>{item.label}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </CardContent>
      )}
    </Card>
  );
}
