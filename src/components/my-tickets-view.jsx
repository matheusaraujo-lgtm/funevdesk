"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, ChevronRight, CircleDot, Clock3, Plus, Search, Ticket } from "lucide-react";
import { ListEmptyState } from "@/components/list-empty-state";
import { ListPagination, useListPagination } from "@/components/list-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/status-badge";
import { cn, timeAgo } from "@/lib/utils";

const statusLabels = { all: "Todos", ABERTO: "Aberto", EM_ATENDIMENTO: "Em atendimento", RESOLVIDO: "Resolvido", CANCELADO: "Cancelado" };

const STAT_TONES = {
  green: "bg-emerald-50 text-emerald-700",
  blue: "bg-blue-50 text-blue-700",
  gray: "bg-muted text-muted-foreground",
};

// Card de métrica que também filtra a lista ao clicar — visual contido, sem relevo.
function StatCard({ icon: Icon, label, value, tone, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center justify-between gap-4 rounded-xl border bg-card p-4 text-left transition",
        active ? "border-primary ring-1 ring-primary" : "hover:border-primary/40"
      )}
    >
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
        <p className="mt-1 font-heading text-2xl font-bold leading-none tracking-tight">{value}</p>
      </div>
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg", STAT_TONES[tone])}><Icon className="size-4" /></span>
    </button>
  );
}

export function MyTicketsView({ tickets, statuses, onOpenTicket, onNewTicket }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  const filtered = useMemo(() => tickets.filter((ticket) => {
    const term = search.trim().toLowerCase();
    return (!term || `${ticket.number} ${ticket.title} ${ticket.ticket_type_name || ""}`.toLowerCase().includes(term))
      && (status === "all" || ticket.status === status);
  }), [tickets, search, status]);

  const pagination = useListPagination(filtered.length, 8);
  const pagedTickets = pagination.sliceItems(filtered);

  const openCount = tickets.filter((t) => t.status === "ABERTO").length;
  const inProgressCount = tickets.filter((t) => t.status === "EM_ATENDIMENTO").length;
  const resolvedCount = tickets.filter((t) => t.status === "RESOLVIDO").length;

  const toggle = (code) => setStatus((current) => (current === code ? "all" : code));

  return (
    <div className="space-y-5 pb-6">
      {/* Header limpo, sem gradiente — combina com o portal minimalista. */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight">Meus chamados</h1>
          <p className="mt-1 text-sm text-muted-foreground">Acompanhe o andamento dos seus pedidos de suporte.</p>
        </div>
        <Button onClick={onNewTicket}><Plus /> Abrir chamado</Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Ticket} label="Abertos" value={openCount} tone="green" active={status === "ABERTO"} onClick={() => toggle("ABERTO")} />
        <StatCard icon={CircleDot} label="Em atendimento" value={inProgressCount} tone="blue" active={status === "EM_ATENDIMENTO"} onClick={() => toggle("EM_ATENDIMENTO")} />
        <StatCard icon={CheckCircle2} label="Concluídos" value={resolvedCount} tone="gray" active={status === "RESOLVIDO"} onClick={() => toggle("RESOLVIDO")} />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por número ou título..." className="h-10 rounded-xl bg-card pl-9" />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-10 w-full rounded-xl bg-card sm:w-48"><SelectValue placeholder="Situação">{(v) => statusLabels[v]}</SelectValue></SelectTrigger>
          <SelectContent>{Object.entries(statusLabels).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {filtered.length ? (
        <>
          <div className="space-y-2.5">
            {pagedTickets.map((ticket) => (
              <div
                key={ticket.id}
                role="button"
                tabIndex={0}
                aria-label={`Abrir chamado #${ticket.number} ${ticket.title}`}
                onClick={() => onOpenTicket(ticket)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenTicket(ticket); } }}
                className="group flex cursor-pointer items-center gap-3 rounded-xl border bg-card px-4 py-3.5 transition hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:gap-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-muted-foreground">#{ticket.number}</span>
                    <StatusBadge value={ticket.status} statuses={statuses} />
                  </div>
                  <p className="mt-0.5 truncate text-sm font-medium">{ticket.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{ticket.ticket_type_name || "—"}</p>
                </div>
                <div className="hidden flex-col items-end gap-1 text-right sm:flex">
                  {ticket.assignee_name
                    ? <span className="text-sm font-medium">{ticket.assignee_name}</span>
                    : <Badge variant="outline">Na fila</Badge>}
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Clock3 className="size-3.5" />{timeAgo(ticket.updated_at)}</span>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
              </div>
            ))}
          </div>
          <ListPagination
            totalItems={filtered.length}
            page={pagination.page}
            pageSize={pagination.pageSize}
            totalPages={pagination.totalPages}
            start={pagination.start}
            end={pagination.end}
            onPageChange={pagination.setPage}
            itemLabel="chamados"
          />
        </>
      ) : (
        <ListEmptyState
          icon={Ticket}
          title={tickets.length ? "Nenhum chamado neste filtro" : "Você ainda não abriu chamados"}
          description={tickets.length ? "Ajuste a busca ou o status selecionado." : "Abra seu primeiro chamado para solicitar suporte à equipe de TI."}
          action={tickets.length ? null : <Button onClick={onNewTicket}><Plus /> Abrir chamado</Button>}
        />
      )}
    </div>
  );
}
