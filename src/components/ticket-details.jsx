"use client";

import { useState } from "react";
import { CheckCircle2, PanelRightClose, PanelRightOpen, Star } from "lucide-react";
import { toast } from "sonner";
import { CancelTicketDialog } from "@/components/cancel-ticket-dialog";
import { RemoteConsoleEmbed } from "@/components/remote-console-embed";
import { ResolveTicketDialog } from "@/components/resolve-ticket-dialog";
import { TicketAssignmentDialog } from "@/components/ticket-assignment-dialog";
import { TicketConversation } from "@/components/ticket-conversation";
import { TicketDetailHeader } from "@/components/ticket-detail-header";
import { TicketDetailSidebar } from "@/components/ticket-detail-sidebar";
import { TicketIncidentForm } from "@/components/ticket-incident-form";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function TicketDetails({
  details,
  users = [],
  assets = [],
  currentUser,
  ticketStatuses = [],
  terminalStatusCode = "RESOLVIDO",
  onBack,
  onStatusChange,
  onRemoteAccess,
  onPatchTicket,
  onAssumeTicket,
  onReload,
}) {
  const [csatScore, setCsatScore] = useState(0);
  const [csatComment, setCsatComment] = useState("");
  const [sending, setSending] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [transferTarget, setTransferTarget] = useState("");
  const [busy, setBusy] = useState("");
  const [asideCollapsed, setAsideCollapsed] = useState(false);

  if (!details) {
    return (
      <div className="ticket-shell flex min-h-[420px] items-center justify-center">
        <p className="text-sm text-muted-foreground">Carregando chamado...</p>
      </div>
    );
  }

  const {
    ticket,
    permissions,
    responses = [],
    attachments = [],
    events = [],
    messages = [],
    approvals = [],
    equipmentTerm,
    termTemplate,
    ticketTypeWorkflow,
    pendingApproval,
    currentUserId,
    statusMeta,
  } = details;

  const statusList = details?.ticketStatuses?.length ? details.ticketStatuses : ticketStatuses;
  const isTerminal = statusMeta?.is_terminal || ticket.status === terminalStatusCode;
  const isRequester = Boolean(ticket.requester_id) && ticket.requester_id === currentUserId;
  // Chamado cancelado não pede avaliação (não houve atendimento a avaliar).
  const canRate = isTerminal && ticket.status !== "CANCELADO" && !ticket.csat_score && ticket.requester_id === currentUserId;
  // O criador do chamado pode desistir enquanto ele não estiver encerrado.
  const canCancel = isRequester && !isTerminal;
  const isMine = ticket.assignee_id === currentUser?.id;
  const sla = slaSummary(ticket);
  const activity = lastActivity(ticket, events, messages);
  const technicians = users.filter((user) => user.active && (user.role === "ADMIN" || user.role === "TECHNICIAN"));
  // Campos STOCK do chamado → itens cuja saída o técnico confirma ao resolver.
  const stockEntries = responses.reduce((acc, response) => {
    if (response.field_type !== "STOCK") return acc;
    try {
      const parsed = JSON.parse(response.value_text || "");
      if (parsed?.itemId) acc.push({ itemId: parsed.itemId, qty: Math.max(1, Number(parsed.qty) || 1), label: response.field_label });
    } catch { /* valor legado sem JSON */ }
    return acc;
  }, []);

  function handleViewAttachments() {
    const openable = attachments.filter((item) => item?.id || item?.public_url);
    if (!openable.length) {
      toast.info("Nenhum anexo disponível.");
      return;
    }
    // Baixa pela rota autenticada e escopada por organização; cai para o link legado só se faltar id.
    openable.forEach((item) => window.open(item.id ? `/api/attachments/${item.id}` : item.public_url, "_blank", "noopener,noreferrer"));
  }

  async function connectRemote() {
    const result = await onRemoteAccess(ticket.id);
    if (!result) return;
    toast.info(result.notice);
  }

  async function handleAssume() {
    setBusy("assume");
    try {
      const ok = await onAssumeTicket?.(ticket.id);
      if (ok) setAssignmentOpen(false);
    } finally {
      setBusy("");
    }
  }

  async function handleTransfer() {
    if (!transferTarget) return toast.error("Selecione um técnico.");
    setBusy("transfer");
    try {
      const ok = await onPatchTicket?.(ticket.id, { assigneeId: transferTarget });
      if (ok) {
        toast.success("Chamado transferido.");
        setAssignmentOpen(false);
        setTransferTarget("");
      }
    } finally {
      setBusy("");
    }
  }

  // Reabre um chamado encerrado: volta para um status ativo (Em atendimento se há
  // responsável; senão Aberto; com fallback para o primeiro status não-terminal configurado).
  async function handleReopen() {
    const activeStatuses = statusList.filter((status) => !status.is_terminal).map((status) => status.code);
    const preferred = ticket.assignee_id ? "EM_ATENDIMENTO" : "ABERTO";
    const target = activeStatuses.includes(preferred) ? preferred : activeStatuses[0];
    if (!target) return toast.error("Nenhuma situação ativa configurada para reabrir.");
    setBusy("reopen");
    try {
      const ok = await onPatchTicket?.(ticket.id, { status: target });
      if (ok) toast.success("Chamado reaberto.");
    } finally {
      setBusy("");
    }
  }

  // Cancelamento pelo solicitante: registra o motivo na conversa pública (avisa o suporte)
  // e encerra o chamado como CANCELADO.
  async function handleCancel(reason) {
    setBusy("cancel");
    try {
      const trimmed = (reason || "").trim();
      if (trimmed) {
        const safe = trimmed.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        await fetch(`/api/tickets/${ticket.id}/messages`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ body: `<p>${safe}</p>`, visibility: "PUBLIC" }),
        }).catch(() => {});
      }
      const ok = await onPatchTicket?.(ticket.id, { cancel: true, cancelReason: trimmed });
      if (ok) {
        toast.success("Chamado cancelado. O suporte foi avisado.");
        setCancelOpen(false);
      }
    } finally {
      setBusy("");
    }
  }

  async function sendConversationMessage({ body, visibility }) {
    setSending(true);
    const response = await fetch(`/api/tickets/${ticket.id}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body, visibility }),
    });
    const result = await response.json().catch(() => ({}));
    setSending(false);
    if (!response.ok) {
      toast.error(result.error || "Não foi possível enviar a mensagem.");
      return false;
    }
    toast.success(visibility === "INTERNAL" ? "Nota interna registrada." : "Resposta enviada.");
    onReload?.();
    return true;
  }

  async function submitCsat(event) {
    event.preventDefault();
    if (!csatScore) return toast.error("Selecione uma nota.");
    const ok = await onPatchTicket?.(ticket.id, { csatScore, csatComment });
    if (ok) toast.success("Obrigado pela avaliação!");
  }

  async function handleResolve(resolutionMessage, stockDeductions = []) {
    setResolving(true);
    const ok = await onStatusChange?.(terminalStatusCode, ticket.id, { resolutionMessage, stockDeductions });
    setResolving(false);
    if (ok) setResolveOpen(false);
  }

  // Aplica status intermediário direto pela pílula (terminal é tratado pelo diálogo de Resolver).
  function handlePillStatusChange(code) {
    return onStatusChange?.(code, ticket.id);
  }

  const workflow = {
    ticket,
    assets,
    users,
    termTemplate,
    approvals,
    pendingApproval,
    equipmentTerm,
    requiresTerm: ticketTypeWorkflow?.requiresTerm,
    permissions,
    currentUserId,
    onReload,
  };

  return (
    <div className="pb-4">
      <TicketDetailHeader
        ticket={ticket}
        statusList={statusList}
        permissions={permissions}
        isMine={isMine}
        isTerminal={isTerminal}
        busy={busy}
        sla={sla}
        activity={activity}
        attachmentsCount={attachments.length}
        onBack={onBack}
        onConnectRemote={connectRemote}
        onAssume={handleAssume}
        onOpenAssignment={() => setAssignmentOpen(true)}
        onResolve={() => setResolveOpen(true)}
        onViewAttachments={handleViewAttachments}
        onStatusChange={handlePillStatusChange}
      />

      {/* SLA em destaque no topo em telas pequenas — no mobile a sidebar fica no fim da pilha. */}
      {sla && (
        <div className={`mb-3 flex items-center justify-between gap-2 rounded-xl border px-3 py-2 lg:hidden ${
          sla.tone === "destructive" ? "border-red-200 bg-red-50 text-red-700"
            : sla.tone === "warning" ? "border-amber-200 bg-amber-50 text-amber-700"
            : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
          <span className="text-[11px] font-semibold uppercase tracking-wide">SLA</span>
          <span className="text-xs font-semibold">{sla.label}</span>
        </div>
      )}

      <div className="mb-2 hidden justify-end lg:flex">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs text-muted-foreground"
          onClick={() => setAsideCollapsed((v) => !v)}
          aria-pressed={asideCollapsed}
        >
          {asideCollapsed ? <><PanelRightOpen className="size-3.5" /> Mostrar detalhes</> : <><PanelRightClose className="size-3.5" /> Ocultar detalhes</>}
        </Button>
      </div>

      <div className="ticket-grid" data-aside={asideCollapsed ? "collapsed" : "expanded"}>
        <TicketConversation
          ticket={ticket}
          messages={messages}
          events={events}
          permissions={permissions}
          currentUserId={currentUserId}
          onSend={sendConversationMessage}
          sending={sending}
          isResolved={isTerminal}
        />

        {!asideCollapsed && (
          <div className="ticket-aside">
            <TicketDetailSidebar
              ticket={ticket}
              permissions={permissions}
              isMine={isMine}
              isTerminal={isTerminal}
              canCancel={canCancel}
              sla={sla}
              slaProgressPercent={slaProgressPercent(ticket)}
              onAssume={handleAssume}
              onOpenAssignment={() => setAssignmentOpen(true)}
              onConnectRemote={connectRemote}
              onResolve={() => setResolveOpen(true)}
              onReopen={handleReopen}
              onCancel={() => setCancelOpen(true)}
              busy={busy}
            />

            <TicketIncidentForm
              responses={responses}
              attachments={attachments}
              ticketId={ticket.id}
              ticket={ticket}
              canEdit={permissions.canManageTickets && !isTerminal}
              canViewChecklist={permissions.canManageTickets}
              workflow={workflow}
              collapsible
            />
          </div>
        )}
      </div>

      {canRate && (
        <CsatPanel
          csatScore={csatScore}
          setCsatScore={setCsatScore}
          csatComment={csatComment}
          setCsatComment={setCsatComment}
          onSubmit={submitCsat}
        />
      )}

      <TicketAssignmentDialog
        open={assignmentOpen}
        onOpenChange={(open) => {
          setAssignmentOpen(open);
          if (!open) setTransferTarget("");
        }}
        isMine={isMine}
        currentUserId={currentUser?.id}
        assigneeId={ticket.assignee_id}
        assigneeName={ticket.assignee_name}
        technicians={technicians}
        transferTarget={transferTarget}
        onTransferTargetChange={setTransferTarget}
        busy={busy}
        onAssume={handleAssume}
        onTransfer={handleTransfer}
      />

      <ResolveTicketDialog open={resolveOpen} onOpenChange={setResolveOpen} onConfirm={handleResolve} loading={resolving} stockEntries={stockEntries} branchId={ticket.branch_id} />

      <CancelTicketDialog open={cancelOpen} onOpenChange={setCancelOpen} onConfirm={handleCancel} loading={busy === "cancel"} ticketNumber={ticket.number} />
    </div>
  );
}

const csatLabels = { 1: "Ruim", 2: "Regular", 3: "Bom", 4: "Muito bom", 5: "Ótimo" };

function CsatPanel({ csatScore, setCsatScore, csatComment, setCsatComment, onSubmit }) {
  return (
    <div className="ticket-shell mt-3 p-4">
      <div className="mb-3 flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800">
        <CheckCircle2 className="size-4 shrink-0" />
        <p className="text-xs font-semibold">Chamado resolvido. Avalie o atendimento para nos ajudar a melhorar.</p>
      </div>
      <div className="mb-3 flex items-center gap-2">
        <Star className="size-4 text-amber-500" />
        <h3 className="text-sm font-semibold">Como foi o atendimento?</h3>
      </div>
      <form className="space-y-3" onSubmit={onSubmit}>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((score) => (
            <Button
              key={score}
              type="button"
              variant={csatScore === score ? "default" : "outline"}
              size="sm"
              className="h-auto flex-col gap-1 px-2 py-1.5"
              aria-label={`${score} - ${csatLabels[score]}`}
              title={csatLabels[score]}
              onClick={() => setCsatScore(score)}
            >
              <Star className={`size-4 ${csatScore >= score ? "fill-current" : ""}`} />
              <span className="text-[10px] font-semibold leading-none">{score}</span>
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{csatScore ? csatLabels[csatScore] : "1 = Ruim · 5 = Ótimo"}</p>
        <Textarea value={csatComment} onChange={(event) => setCsatComment(event.target.value)} placeholder="Comentário opcional..." rows={2} className="resize-none text-sm" />
        <Button type="submit" size="sm">Enviar avaliação</Button>
      </form>
    </div>
  );
}

function slaSummary(ticket) {
  if (!ticket.sla_due_at) return null;
  const due = new Date(ticket.sla_due_at);
  const diffMs = due.getTime() - Date.now();
  const absHours = Math.max(1, Math.abs(Math.round(diffMs / 3600000)));
  if (ticket.sla_status === "VIOLADO") return { label: `Violado há ${absHours}h`, tone: "destructive" };
  if (ticket.sla_status === "ATENCAO" || ticket.sla_status === "EM_RISCO") return { label: `${absHours}h restantes`, tone: "warning" };
  return { label: `${absHours}h restantes`, tone: "success" };
}

function slaProgressPercent(ticket) {
  if (!ticket.sla_due_at) return 0;
  const start = new Date(ticket.created_at).getTime();
  const end = new Date(ticket.sla_due_at).getTime();
  const now = Date.now();
  if (end <= start) return 100;
  return Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
}

function lastActivity(ticket, events = [], messages = []) {
  const candidates = [
    { at: ticket.updated_at, actor: ticket.assignee_name || ticket.requester_name },
    ...events.map((event) => ({ at: event.created_at, actor: event.actor_name })),
    ...messages.map((message) => ({ at: message.created_at, actor: message.author_name })),
  ].filter((item) => item.at);
  candidates.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const latest = candidates[0];
  if (!latest) return { time: formatRelativeHeader(ticket.updated_at), actor: ticket.assignee_name || "—" };
  return { time: formatRelativeHeader(latest.at), actor: latest.actor || "—" };
}

function formatRelativeHeader(date) {
  const diffMs = Date.now() - new Date(date).getTime();
  const minutes = Math.max(1, Math.round(diffMs / 60000));
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  return new Date(date).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}
