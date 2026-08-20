"use client";

import { useState } from "react";
import { GripVertical } from "lucide-react";
import { timeAgo } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import { statusColorHex } from "@/lib/status-colors";

const priorityLabels = { BAIXA: "Baixa", MEDIA: "Média", ALTA: "Alta", CRITICA: "Crítica" };
const priorityHigh = new Set(["ALTA", "CRITICA"]);

const FALLBACK_COLUMNS = [
  { code: "ABERTO", label: "Aberto", is_terminal: false },
  { code: "EM_ATENDIMENTO", label: "Em atendimento", is_terminal: false },
  { code: "RESOLVIDO", label: "Resolvido", is_terminal: true },
];

// Resolvido sempre por último e Cancelado o penúltimo — os demais status (inclusive os
// criados depois em Configurações) ficam entre os status ativos e esses dois, na ordem
// configurada (sort_order).
const END_COLUMN_WEIGHT = { CANCELADO: 1, RESOLVIDO: 2 };
function orderColumns(list) {
  return [...list].sort((a, b) => {
    const weightA = END_COLUMN_WEIGHT[a.code] || 0;
    const weightB = END_COLUMN_WEIGHT[b.code] || 0;
    if (weightA !== weightB) return weightA - weightB;
    return (a.sort_order ?? 0) - (b.sort_order ?? 0);
  });
}

// Colunas terminais (Resolvido, Cancelado etc.) podem acumular milhares de chamados ao
// longo do tempo — carregar tudo no quadro trava a rolagem e não ajuda o técnico, que só
// precisa ver os mais recentes. Os cartões mais antigos continuam acessíveis pela lista.
const TERMINAL_COLUMN_CAP = 10;

function initials(name = "Usuário") {
  return name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase();
}

function KanbanCard({ ticket, currentUser, draggable, dragging, onOpen, onDragStart, onDragEnd }) {
  const isMine = ticket.assignee_id === currentUser.id;
  const requesterName = ticket.requester_name || ticket.hostname || "Automático";
  return (
    <div
      draggable={draggable}
      onDragStart={(event) => onDragStart(event, ticket)}
      onDragEnd={onDragEnd}
      onClick={() => onOpen(ticket)}
      className={`group cursor-pointer rounded-xl border border-border/60 bg-card p-3 shadow-xs transition hover:border-primary/40 hover:shadow-sm ${dragging ? "opacity-40" : ""} ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-muted-foreground">#{ticket.number}</span>
        {draggable && <GripVertical className="size-3.5 shrink-0 text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />}
      </div>
      <p className="mb-2 line-clamp-2 text-[13px] font-medium leading-snug">{ticket.title}</p>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          <i className={`size-1.5 rounded-full ${priorityHigh.has(ticket.priority) ? "bg-destructive" : ticket.priority === "MEDIA" ? "bg-primary" : "bg-muted-foreground"}`} />
          {priorityLabels[ticket.priority] || ticket.priority}
        </span>
        {ticket.sla_status && <StatusBadge value={ticket.sla_status} className="h-[18px] px-1.5 text-[10px]" />}
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Avatar className="size-5 shrink-0">
            {ticket.requester_avatar_url && <AvatarImage src={ticket.requester_avatar_url} alt={requesterName} />}
            <AvatarFallback className="text-[9px]">{initials(requesterName)}</AvatarFallback>
          </Avatar>
          <span className="truncate text-[11px] text-muted-foreground">{requesterName}</span>
        </div>
        <span className="shrink-0 text-[10px] text-muted-foreground">{timeAgo(ticket.updated_at)}</span>
      </div>
      {ticket.assignee_name && (
        <div className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground">
          <span className="truncate">{ticket.assignee_name}</span>
          {isMine && <Badge variant="success" className="h-4 shrink-0 px-1 text-[9px] leading-none">Você</Badge>}
        </div>
      )}
    </div>
  );
}

// Quadro Kanban da fila de chamados: colunas = situações configuradas (ordem/cor vêm de
// Configurações > Situações), cartões arrastáveis entre colunas para o técnico mudar o
// status sem entrar no chamado. HTML5 drag-and-drop nativo — sem dependência extra.
export function TicketsKanbanBoard({ tickets, statuses, currentUser, permissions, onOpenTicket, onMoveTicket }) {
  const [draggingId, setDraggingId] = useState(null);
  const [overCode, setOverCode] = useState(null);
  const canDrag = permissions.canManageTickets;
  const columns = orderColumns(statuses.length ? statuses : FALLBACK_COLUMNS);

  function handleDragStart(event, ticket) {
    if (!canDrag) return;
    setDraggingId(ticket.id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", ticket.id);
  }
  function handleDragEnd() {
    setDraggingId(null);
    setOverCode(null);
  }
  function handleDrop(event, column) {
    event.preventDefault();
    setOverCode(null);
    const id = event.dataTransfer.getData("text/plain") || draggingId;
    setDraggingId(null);
    if (!id || !canDrag) return;
    const ticket = tickets.find((item) => item.id === id);
    if (!ticket || ticket.status === column.code) return;
    onMoveTicket?.(ticket, column);
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {columns.map((column) => {
        const columnTickets = tickets.filter((ticket) => ticket.status === column.code);
        const isCapped = column.is_terminal && columnTickets.length > TERMINAL_COLUMN_CAP;
        const items = isCapped ? columnTickets.slice(0, TERMINAL_COLUMN_CAP) : columnTickets;
        const dotColor = statusColorHex(column.color) || "#94a3b8";
        return (
          <div
            key={column.code}
            onDragOver={(event) => { if (canDrag) { event.preventDefault(); setOverCode(column.code); } }}
            onDragLeave={() => setOverCode((current) => (current === column.code ? null : current))}
            onDrop={(event) => handleDrop(event, column)}
            className={`flex w-72 shrink-0 flex-col rounded-2xl border bg-muted/20 transition-colors ${overCode === column.code ? "border-primary/50 bg-primary/5" : "border-border/60"}`}
          >
            <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2.5">
              <i className="size-2 shrink-0 rounded-full" style={{ backgroundColor: dotColor }} aria-hidden="true" />
              <p className="truncate text-xs font-semibold">{column.label}</p>
              <Badge variant="secondary" className="ml-auto shrink-0 px-1.5 text-[10px] tabular-nums">{columnTickets.length}</Badge>
            </div>
            <div className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto p-2.5">
              {isCapped && (
                <p className="px-1 text-center text-[10px] text-muted-foreground">
                  Mostrando os {TERMINAL_COLUMN_CAP} mais recentes de {columnTickets.length}
                </p>
              )}
              {items.length === 0 ? (
                <p className="px-2 py-6 text-center text-[11px] text-muted-foreground">Nenhum chamado</p>
              ) : items.map((ticket) => (
                <KanbanCard
                  key={ticket.id}
                  ticket={ticket}
                  currentUser={currentUser}
                  draggable={canDrag}
                  dragging={draggingId === ticket.id}
                  onOpen={onOpenTicket}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
