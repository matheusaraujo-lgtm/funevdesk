"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Bookmark, CheckCircle2, CircleDot, Clock3, ExternalLink, HandMetal, Headset, MoreVertical, Save, Search, SlidersHorizontal, Ticket, Trash2, UserCog, X } from "lucide-react";
import { toast } from "sonner";
import { timeAgo } from "@/lib/utils";
import { ListEmptyState } from "@/components/list-empty-state";
import { ListPagination, useListPagination } from "@/components/list-pagination";
import { ResolveTicketDialog } from "@/components/resolve-ticket-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/searchable-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const statusLabels = { all: "Todos", ABERTO: "Aberto", EM_ATENDIMENTO: "Em atendimento", RESOLVIDO: "Resolvido" };
const priorityLabels = { all: "Todas", HIGH: "Alta e crítica", BAIXA: "Baixa", MEDIA: "Média", ALTA: "Alta", CRITICA: "Crítica" };
const slaLabels = { all: "Todos", OK: "SLA OK", ATENCAO: "Em risco", VIOLADO: "Violado" };
const queuePresets = [
  { id: "all", label: "Todos" },
  { id: "mine", label: "Meus chamados" },
  { id: "unassigned", label: "Não atribuídos" },
  { id: "open", label: "Abertos" },
];
const avatarTones = ["bg-primary/10 text-primary", "bg-secondary text-secondary-foreground", "bg-accent text-accent-foreground", "bg-muted text-muted-foreground"];

function initials(name = "Usuário") {
  return name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase();
}

// Chip de filtro compacto: contador + filtro num clique, sem repetir os KPIs grandes
// do Dashboard. Densidade no nível Linear/Zendesk (faixa de filtros, não cards).
function FilterChip({ icon: Icon, label, value, tone, active, onClick }) {
  const tones = { blue: "text-primary", green: "text-emerald-600", orange: "text-amber-600", red: "text-destructive", violet: "text-muted-foreground" };
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active || undefined}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? "border-primary/30 bg-primary/5" : "bg-card"}`}
    >
      <Icon className={`size-3.5 ${tones[tone]}`} />
      {label}
      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-semibold tabular-nums">{value}</span>
    </button>
  );
}

function Filter({ label, value, onValueChange, options }) {
  return <div className="space-y-1.5"><p className="flex h-4 items-center truncate text-[11px] font-medium leading-none text-muted-foreground">{label}</p><Select value={value} onValueChange={onValueChange}><SelectTrigger className="h-9 w-full bg-card"><SelectValue placeholder={options[value]}>{(current) => options[current]}</SelectValue></SelectTrigger><SelectContent>{Object.entries(options).map(([key, text]) => <SelectItem key={key} value={key}>{text}</SelectItem>)}</SelectContent></Select></div>;
}

function SearchableFilter({ label, value, onValueChange, options, searchPlaceholder }) {
  const placeholder = options.find((option) => option.value === value)?.label || "Selecione...";
  return <div className="space-y-1.5"><p className="flex h-4 items-center truncate text-[11px] font-medium leading-none text-muted-foreground">{label}</p><SearchableSelect value={value} onValueChange={onValueChange} options={options} placeholder={placeholder} searchPlaceholder={searchPlaceholder} triggerClassName="h-9 w-full bg-card" /></div>;
}

export function TicketsView({ tickets, catalog = [], users = [], currentUser, permissions, ticketStatuses = [], terminalStatusCode = "RESOLVIDO", initialQueue = null, onQueueApplied, onOpenTicket, onRemoteAccess, onStatusChange, onAssumeTicket, onBulkPatch }) {
  const [search, setSearch] = useState("");
  const [queue, setQueue] = useState("all");
  const [status, setStatus] = useState("all");
  const [priority, setPriority] = useState("all");
  const [category, setCategory] = useState("all");
  const [ticketType, setTicketType] = useState("all");
  const [slaFilter, setSlaFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [teamFilter, setTeamFilter] = useState("all");
  const [showResolved, setShowResolved] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [resolveTarget, setResolveTarget] = useState(null);
  const [resolving, setResolving] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const keyboardRef = useRef({});
  const [views, setViews] = useState([]);
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [viewName, setViewName] = useState("");
  const canBulk = permissions.canManageTickets && typeof onBulkPatch === "function";
  const terminalCodes = useMemo(
    () => ticketStatuses.filter((item) => item.is_terminal).map((item) => item.code),
    [ticketStatuses],
  );
  const isActiveTicket = (ticket) => !terminalCodes.includes(ticket.status) && ticket.status !== terminalStatusCode;
  const statusFilterLabels = useMemo(() => ({
    all: "Todos",
    ...Object.fromEntries(ticketStatuses.map((item) => [item.code, item.label])),
    ...(ticketStatuses.length ? {} : { ABERTO: "Aberto", EM_ATENDIMENTO: "Em atendimento", RESOLVIDO: "Resolvido" }),
  }), [ticketStatuses]);
  const categories = useMemo(() => ({ all: "Todas", ...Object.fromEntries([...new Set(tickets.map((ticket) => ticket.category))].map((item) => [item, item])) }), [tickets]);
  const ticketTypeOptions = useMemo(() => {
    const names = new Set(tickets.map((ticket) => ticket.ticket_type_name).filter(Boolean));
    catalog.filter((type) => type.active).forEach((type) => names.add(type.name));
    return [{ value: "all", label: "Todos os tipos" }, ...[...names].sort((a, b) => a.localeCompare(b, "pt-BR")).map((name) => ({ value: name, label: name }))];
  }, [tickets, catalog]);
  const assigneeOptions = useMemo(() => [{ value: "all", label: "Todos" }, { value: "none", label: "Não atribuído" }, ...users.filter((u) => u.active).map((u) => ({ value: u.id, label: u.name }))], [users]);
  const teamOptions = useMemo(() => {
    const teams = new Map();
    tickets.forEach((ticket) => {
      if (ticket.team_id) teams.set(ticket.team_id, ticket.team_name || ticket.team_id);
    });
    return [{ value: "all", label: "Todas" }, ...[...teams.entries()].map(([value, label]) => ({ value, label }))];
  }, [tickets]);

  const filtered = useMemo(() => tickets.filter((ticket) => {
    const term = search.trim().toLowerCase();
    const isResolved = terminalCodes.includes(ticket.status) || ticket.status === terminalStatusCode;
    if (isResolved && !showResolved) return false;
    const queueMatch = queue === "all"
      || (queue === "mine" && ticket.assignee_id === currentUser.id)
      || (queue === "unassigned" && !ticket.assignee_id && isActiveTicket(ticket))
      || (queue === "open" && ticket.status === "ABERTO");
    return queueMatch
      && (!term || `${ticket.number} ${ticket.title} ${ticket.requester_name || ""} ${ticket.hostname || ""} ${ticket.assignee_name || ""}`.toLowerCase().includes(term))
      && (status === "all" || ticket.status === status)
      && (priority === "all" || (priority === "HIGH" ? (ticket.priority === "ALTA" || ticket.priority === "CRITICA") : ticket.priority === priority))
      && (category === "all" || ticket.category === category)
      && (ticketType === "all" || ticket.ticket_type_name === ticketType)
      && (slaFilter === "all" || ticket.sla_status === slaFilter)
      && (assigneeFilter === "all" || (assigneeFilter === "none" ? !ticket.assignee_id : ticket.assignee_id === assigneeFilter))
      && (teamFilter === "all" || ticket.team_id === teamFilter);
  }), [tickets, search, queue, status, priority, category, ticketType, slaFilter, assigneeFilter, teamFilter, currentUser.id, terminalCodes, terminalStatusCode, showResolved]);

  const pagination = useListPagination(filtered.length, 10);
  const pagedTickets = pagination.sliceItems(filtered);

  const pageIds = pagedTickets.map((ticket) => ticket.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const someSelected = selectedIds.size > 0;
  const technicians = useMemo(() => users.filter((u) => u.active && (u.role === "ADMIN" || u.role === "TECHNICIAN")), [users]);
  const bulkStatuses = useMemo(() => ticketStatuses.filter((item) => !item.is_terminal && item.code !== terminalStatusCode), [ticketStatuses, terminalStatusCode]);

  function toggleOne(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function togglePage() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function runBulk(payload, successVerb) {
    const ids = [...selectedIds];
    if (!ids.length) return;
    setBulkBusy(true);
    const result = await onBulkPatch?.(ids, payload);
    setBulkBusy(false);
    if (result) {
      toast.success(`${result.ok}/${result.total} chamado(s) ${successVerb}.`);
      clearSelection();
    } else {
      toast.error("Não foi possível concluir a ação em massa.");
    }
  }

  const opened = tickets.filter((ticket) => ticket.status === "ABERTO").length;
  const inProgress = tickets.filter((ticket) => ticket.status === "EM_ATENDIMENTO").length;
  const critical = tickets.filter((ticket) => isActiveTicket(ticket) && (ticket.priority === "CRITICA" || ticket.priority === "ALTA")).length;
  const resolved = tickets.filter((ticket) => terminalCodes.includes(ticket.status) || ticket.status === terminalStatusCode).length;
  const slaViolations = tickets.filter((ticket) => ticket.sla_status === "VIOLADO").length;
  const mineCount = tickets.filter((t) => t.assignee_id === currentUser.id && isActiveTicket(t)).length;
  const unassignedCount = tickets.filter((t) => !t.assignee_id && isActiveTicket(t)).length;

  function clearFilters() {
    setSearch(""); setQueue("all"); setStatus("all"); setPriority("all"); setCategory("all"); setTicketType("all"); setSlaFilter("all"); setAssigneeFilter("all"); setTeamFilter("all"); setShowResolved(false);
  }

  // Filtros avançados (escondidos no painel "Filtros") ativos, para o badge contador.
  const advancedActive = [priority !== "all", slaFilter !== "all", assigneeFilter !== "all", teamFilter !== "all", ticketType !== "all", showResolved].filter(Boolean).length;
  const hasActiveFilters = Boolean(search) || status !== "all" || advancedActive > 0;

  function applyQueue(preset) {
    setQueue(preset);
    if (preset === "open") setStatus("ABERTO");
    else if (preset === "unassigned") setAssigneeFilter("none");
    else if (preset === "mine") setAssigneeFilter(currentUser.id);
    else if (preset === "all") { setStatus("all"); setAssigneeFilter("all"); }
  }

  function filterOpened() {
    clearFilters();
    setStatus("ABERTO");
  }

  function filterInProgress() {
    clearFilters();
    setStatus("EM_ATENDIMENTO");
  }

  function filterSlaViolated() {
    clearFilters();
    setSlaFilter("VIOLADO");
  }

  function filterCritical() {
    clearFilters();
    setPriority("HIGH");
  }

  function filterResolved() {
    clearFilters();
    setShowResolved(true);
    setStatus(terminalStatusCode);
  }

  // Aplica o filtro recebido do dashboard uma única vez ao montar, reutilizando os próprios setters.
  useEffect(() => {
    if (!initialQueue) return;
    if (initialQueue === "mine" || initialQueue === "unassigned" || initialQueue === "open" || initialQueue === "all") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      applyQueue(initialQueue);
    } else if (initialQueue === "sla") {
      filterSlaViolated();
    } else if (initialQueue === "critical") {
      filterCritical();
    } else if (initialQueue === "inprogress") {
      filterInProgress();
    } else if (initialQueue === "resolved") {
      filterResolved();
    }
    onQueueApplied?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAssume(ticket) {
    const ok = await onAssumeTicket?.(ticket.id);
    if (ok) toast.success(ticket.assignee_id === currentUser.id ? "Chamado atualizado." : "Chamado assumido.");
  }

  async function handleRemote(ticket) {
    const result = await onRemoteAccess?.(ticket.id);
    if (!result) return;
    toast.info(result.notice);
  }

  async function handleResolve(resolutionMessage) {
    if (!resolveTarget) return;
    setResolving(true);
    const ok = await onStatusChange?.(terminalStatusCode, resolveTarget.id, { resolutionMessage });
    setResolving(false);
    if (ok) setResolveTarget(null);
  }

  // Visões salvas (padrão Linear/Zendesk): snapshot dos filtros, por usuário.
  useEffect(() => {
    if (!permissions.canManageTickets) return;
    fetch("/api/views", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { views: [] }))
      .then((data) => setViews(data.views || []))
      .catch(() => setViews([]));
  }, [permissions.canManageTickets]);

  function currentFilters() {
    return { search, queue, status, priority, category, ticketType, slaFilter, assigneeFilter, teamFilter, showResolved };
  }
  function applyView(filters) {
    setSearch(filters.search || "");
    setQueue(filters.queue || "all");
    setStatus(filters.status || "all");
    setPriority(filters.priority || "all");
    setCategory(filters.category || "all");
    setTicketType(filters.ticketType || "all");
    setSlaFilter(filters.slaFilter || "all");
    setAssigneeFilter(filters.assigneeFilter || "all");
    setTeamFilter(filters.teamFilter || "all");
    setShowResolved(Boolean(filters.showResolved));
  }
  async function saveView() {
    const name = viewName.trim();
    if (!name) return;
    const response = await fetch("/api/views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, filters: currentFilters() }),
    });
    if (!response.ok) return toast.error("Não foi possível salvar a visão.");
    setViews((await response.json()).views || []);
    setSaveViewOpen(false);
    setViewName("");
    toast.success(`Visão "${name}" salva.`);
  }
  async function deleteView(view) {
    const response = await fetch(`/api/views/${view.id}`, { method: "DELETE" });
    if (!response.ok) return toast.error("Não foi possível remover a visão.");
    setViews((await response.json()).views || []);
    toast.success("Visão removida.");
  }

  // Navegação por teclado na fila (padrão Linear): J/↓ e K/↑ movem, Enter abre, A assume.
  useEffect(() => {
    keyboardRef.current = { pagedTickets, permissions, isActiveTicket, currentUserId: currentUser?.id, onOpenTicket, handleAssume };
  });
  useEffect(() => {
    function onKey(event) {
      const el = event.target;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const ctx = keyboardRef.current;
      if (!ctx.pagedTickets.length) return;
      const key = event.key.toLowerCase();
      if (key === "j" || event.key === "ArrowDown") {
        event.preventDefault();
        setFocusedIndex((i) => Math.min(ctx.pagedTickets.length - 1, i + 1));
      } else if (key === "k" || event.key === "ArrowUp") {
        event.preventDefault();
        setFocusedIndex((i) => Math.max(0, (i < 0 ? 1 : i) - 1));
      } else if (event.key === "Enter") {
        setFocusedIndex((i) => { if (i >= 0 && ctx.pagedTickets[i]) ctx.onOpenTicket(ctx.pagedTickets[i]); return i; });
      } else if (key === "a") {
        setFocusedIndex((i) => {
          const ticket = ctx.pagedTickets[i];
          if (i >= 0 && ticket && ctx.permissions?.canManageTickets && ctx.isActiveTicket(ticket) && ticket.assignee_id !== ctx.currentUserId) {
            ctx.handleAssume(ticket);
          }
          return i;
        });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Mantém o índice focado dentro dos limites quando a lista muda (filtro/página).
  const focused = focusedIndex < pagedTickets.length ? focusedIndex : -1;
  const focusedRowRef = useRef(null);
  useEffect(() => { focusedRowRef.current?.scrollIntoView({ block: "nearest" }); }, [focused]);

  return <div className="space-y-5 pb-6">
    {/* Header em destaque */}
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/[0.07] via-card to-secondary/25 px-5 py-5 ring-1 ring-foreground/10 sm:px-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-start gap-3.5">
          <span className="hidden size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm sm:flex"><Ticket className="size-5" /></span>
          <div>
            <h1 className="page-title text-[26px]">Chamados</h1>
            <p className="page-copy max-w-md">Fila de atendimento · clique em um chamado para abrir ou use o menu de ações rápidas.</p>
          </div>
        </div>
      </div>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <FilterChip icon={Ticket} label="Abertos" value={opened} tone="blue" onClick={filterOpened} />
      <FilterChip icon={CircleDot} label="Em andamento" value={inProgress} tone="green" onClick={filterInProgress} />
      <FilterChip icon={Clock3} label="SLA violado" value={slaViolations} tone="orange" onClick={filterSlaViolated} />
      <FilterChip icon={AlertTriangle} label="Alta/crítica" value={critical} tone="red" onClick={filterCritical} />
      <FilterChip icon={CheckCircle2} label="Concluídos" value={resolved} tone="violet" onClick={filterResolved} />
      <span className="ml-auto hidden items-center gap-1 text-[11px] text-muted-foreground xl:inline-flex">
        <kbd className="rounded border bg-muted px-1 font-sans">J</kbd><kbd className="rounded border bg-muted px-1 font-sans">K</kbd> navegar ·
        <kbd className="rounded border bg-muted px-1 font-sans">Enter</kbd> abrir ·
        <kbd className="rounded border bg-muted px-1 font-sans">A</kbd> assumir
      </span>
    </div>

    <div className="flex flex-wrap gap-2">
      {queuePresets.map((preset) => (
        <Button key={preset.id} variant={queue === preset.id ? "default" : "outline"} size="sm" onClick={() => applyQueue(preset.id)}>
          {preset.label}
          {preset.id === "mine" && mineCount > 0 && <Badge variant="secondary" className="ml-1">{mineCount}</Badge>}
          {preset.id === "unassigned" && unassignedCount > 0 && <Badge variant="secondary" className="ml-1">{unassignedCount}</Badge>}
        </Button>
      ))}
    </div>

    <Card className="overflow-hidden rounded-2xl border-0 py-0 shadow-none ring-1 ring-foreground/10">
      <div className="border-b p-4">
        {/* Linha principal: busca + situação + acesso aos filtros avançados (padrão Zendesk/Linear). */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar chamados..." className="h-9 pl-9" /></div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-9 shrink-0 bg-card sm:w-[150px]"><SelectValue placeholder="Situação">{(current) => statusFilterLabels[current]}</SelectValue></SelectTrigger>
            <SelectContent>{Object.entries(statusFilterLabels).map(([key, text]) => <SelectItem key={key} value={key}>{text}</SelectItem>)}</SelectContent>
          </Select>
          {permissions.canManageTickets && (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="h-9 shrink-0" />}>
                <Bookmark className="size-3.5" /> Visões{views.length > 0 && <Badge variant="secondary" className="ml-1">{views.length}</Badge>}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-80 w-64 overflow-y-auto">
                {views.length === 0 && <p className="px-2 py-3 text-center text-xs text-muted-foreground">Nenhuma visão salva ainda.</p>}
                {views.map((view) => (
                  <DropdownMenuItem key={view.id} onClick={() => applyView(view.filters)} className="justify-between gap-2">
                    <span className="truncate">{view.name}</span>
                    <button type="button" aria-label={`Remover visão ${view.name}`} className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive" onClick={(event) => { event.stopPropagation(); deleteView(view); }}><Trash2 className="size-3.5" /></button>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => { setViewName(""); setSaveViewOpen(true); }}><Save className="size-3.5" /> Salvar visão atual</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button variant={showFilters || advancedActive > 0 ? "secondary" : "outline"} size="sm" className="h-9 shrink-0" onClick={() => setShowFilters((current) => !current)}>
            <SlidersHorizontal className="size-3.5" /> Filtros{advancedActive > 0 && <Badge variant="secondary" className="ml-1">{advancedActive}</Badge>}
          </Button>
          {hasActiveFilters && <Button variant="ghost" size="sm" className="h-9 shrink-0" onClick={clearFilters}><X className="size-3.5" /> Limpar</Button>}
        </div>
        {showFilters && (
          <div className="mt-3 grid gap-3 border-t pt-3 sm:grid-cols-2 lg:grid-cols-3">
            <Filter label="Prioridade" value={priority} onValueChange={setPriority} options={priorityLabels} />
            <Filter label="SLA" value={slaFilter} onValueChange={setSlaFilter} options={slaLabels} />
            {permissions.canManageTickets && <SearchableFilter label="Responsável" value={assigneeFilter} onValueChange={setAssigneeFilter} options={assigneeOptions} searchPlaceholder="Buscar..." />}
            {permissions.canManageTickets && <SearchableFilter label="Equipe" value={teamFilter} onValueChange={setTeamFilter} options={teamOptions} searchPlaceholder="Buscar equipe..." />}
            <SearchableFilter label="Tipo de chamado" value={ticketType} onValueChange={setTicketType} options={ticketTypeOptions} searchPlaceholder="Buscar tipo..." />
            <div className="space-y-1.5">
              <p className="flex h-4 items-center truncate text-[11px] font-medium leading-none text-muted-foreground">Exibição</p>
              <label className="flex h-9 cursor-pointer items-center gap-2 rounded-md border bg-card px-3">
                <Checkbox checked={showResolved} onCheckedChange={setShowResolved} />
                <span className="truncate whitespace-nowrap text-xs">Mostrar resolvidos</span>
              </label>
            </div>
          </div>
        )}
      </div>
      {canBulk && someSelected && (
        <div className="flex flex-wrap items-center gap-2 border-b bg-primary/5 px-4 py-2.5">
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold"><UserCog className="size-4 text-primary" />{selectedIds.size} selecionado(s)</span>
          <Button size="sm" variant="outline" className="h-8" disabled={bulkBusy} onClick={() => runBulk({ assigneeId: currentUser.id }, "atribuído(s) a você")}>
            <HandMetal className="size-3.5" /> Atribuir a mim
          </Button>
          <Select value="" onValueChange={(value) => value && runBulk({ assigneeId: value }, "atribuído(s)")} disabled={bulkBusy}>
            <SelectTrigger className="h-8 w-[185px] bg-card"><SelectValue placeholder="Atribuir responsável..." /></SelectTrigger>
            <SelectContent>{technicians.map((tech) => <SelectItem key={tech.id} value={tech.id}>{tech.name}</SelectItem>)}</SelectContent>
          </Select>
          {bulkStatuses.length > 0 && (
            <Select value="" onValueChange={(value) => value && runBulk({ status: value }, "atualizado(s)")} disabled={bulkBusy}>
              <SelectTrigger className="h-8 w-[170px] bg-card"><SelectValue placeholder="Alterar situação..." /></SelectTrigger>
              <SelectContent>{bulkStatuses.map((item) => <SelectItem key={item.code} value={item.code}>{item.label}</SelectItem>)}</SelectContent>
            </Select>
          )}
          <Button size="sm" variant="ghost" className="ml-auto h-8" onClick={clearSelection} disabled={bulkBusy}><X className="size-3.5" /> Limpar seleção</Button>
        </div>
      )}
      <div className="overflow-x-auto">
        {filtered.length === 0 ? (
          <ListEmptyState
            icon={Ticket}
            title="Nenhum chamado encontrado"
            description="Ajuste os filtros ou a busca para localizar chamados na fila."
          />
        ) : (
        <>
        <Table className="hidden min-w-[860px] table-fixed md:table"><TableHeader><TableRow className="bg-muted/10"><TableHead className="w-10 px-3"><Checkbox aria-label="Selecionar todos" checked={allPageSelected} onCheckedChange={togglePage} disabled={!canBulk} /></TableHead><TableHead className="w-[58px]">ID</TableHead><TableHead>Título</TableHead><TableHead className="w-[168px]">Usuário</TableHead><TableHead className="w-[128px]">Responsável</TableHead><TableHead className="w-[116px]">Situação</TableHead><TableHead className="w-[108px]">SLA</TableHead><TableHead className="w-[96px]">Prioridade</TableHead><TableHead className="w-[80px]">Atualizado</TableHead><TableHead className="w-9" /></TableRow></TableHeader>
        <TableBody>{pagedTickets.map((ticket, index) => {
          const name = ticket.requester_name || ticket.hostname || "Automático";
          const isMine = ticket.assignee_id === currentUser.id;
          const canAssume = permissions.canManageTickets && isActiveTicket(ticket) && !isMine;
          const canResolve = permissions.canManageTickets && isActiveTicket(ticket);
          const canRemote = permissions.canRemoteAccess && ticket.hostname;
          return <TableRow key={ticket.id} ref={index === focused ? focusedRowRef : undefined} data-selected={selectedIds.has(ticket.id) || undefined} data-focused={index === focused || undefined} className="h-[52px] cursor-pointer hover:bg-muted/40 data-[selected]:bg-primary/5 data-[focused]:bg-primary/[0.06] data-[focused]:ring-2 data-[focused]:ring-inset data-[focused]:ring-primary/40" onClick={() => { setFocusedIndex(index); onOpenTicket(ticket); }}><TableCell className="px-3" onClick={(event) => event.stopPropagation()}><Checkbox aria-label={`Selecionar chamado ${ticket.number}`} checked={selectedIds.has(ticket.id)} onCheckedChange={() => toggleOne(ticket.id)} disabled={!canBulk} /></TableCell><TableCell className="px-2 text-xs font-semibold">#{ticket.number}</TableCell><TableCell className="px-2"><p className="truncate text-xs font-medium">{ticket.title}</p><p className="truncate text-[10px] text-muted-foreground">{ticket.ticket_type_name || ticket.category}</p></TableCell><TableCell className="px-2"><div className="flex min-w-0 items-center gap-2"><Avatar className="size-7 shrink-0"><AvatarFallback className={avatarTones[index % avatarTones.length]}>{initials(name)}</AvatarFallback></Avatar><div className="min-w-0"><p className="truncate text-xs font-medium">{name}</p><p className="truncate text-[10px] text-muted-foreground">{ticket.branch_name}</p></div></div></TableCell><TableCell className="px-2"><div className="flex items-center gap-1"><span className="truncate text-xs">{ticket.assignee_name || "—"}</span>{isMine && <Badge variant="success" className="shrink-0 px-1.5 py-0 text-[11px] leading-tight">Você</Badge>}</div></TableCell><TableCell className="px-2 whitespace-nowrap"><StatusBadge value={ticket.status} statuses={ticketStatuses} /></TableCell><TableCell className="px-2 whitespace-nowrap">{ticket.sla_status ? <StatusBadge value={ticket.sla_status} /> : "—"}</TableCell><TableCell className="px-2 whitespace-nowrap"><div className="flex items-center gap-1.5 text-xs"><i className={`size-1.5 shrink-0 rounded-full ${ticket.priority === "ALTA" || ticket.priority === "CRITICA" ? "bg-destructive" : ticket.priority === "MEDIA" ? "bg-primary" : "bg-muted-foreground"}`} />{priorityLabels[ticket.priority]}</div></TableCell><TableCell className="truncate px-2 text-[11px] text-muted-foreground">{timeAgo(ticket.updated_at)}</TableCell><TableCell className="px-0" onClick={(event) => event.stopPropagation()}><DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="size-8" aria-label={`Ações do chamado ${ticket.number}`} />}><MoreVertical /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => onOpenTicket(ticket)}><ExternalLink /> Abrir chamado</DropdownMenuItem>{canAssume && <DropdownMenuItem onClick={() => handleAssume(ticket)}><HandMetal /> Assumir chamado</DropdownMenuItem>}{canRemote && <DropdownMenuItem onClick={() => handleRemote(ticket)}><Headset /> Acesso remoto</DropdownMenuItem>}{canResolve && <><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onClick={() => setResolveTarget(ticket)}><CheckCircle2 /> Resolver chamado</DropdownMenuItem></>}</DropdownMenuContent></DropdownMenu></TableCell></TableRow>;
        })}</TableBody></Table>
        <ul className="divide-y md:hidden">
          {pagedTickets.map((ticket) => {
            const isMine = ticket.assignee_id === currentUser.id;
            const canAssume = permissions.canManageTickets && isActiveTicket(ticket) && !isMine;
            const canResolve = permissions.canManageTickets && isActiveTicket(ticket);
            const canRemote = permissions.canRemoteAccess && ticket.hostname;
            return (
              <li key={ticket.id} className="relative">
                <button type="button" onClick={() => onOpenTicket(ticket)} className="flex w-full flex-col gap-2 px-4 py-3 pr-12 text-left hover:bg-muted/40">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-muted-foreground">#{ticket.number}</span>
                    <StatusBadge value={ticket.status} statuses={ticketStatuses} />
                  </div>
                  <div>
                    <p className="text-sm font-medium leading-snug">{ticket.title}</p>
                    <p className="text-[11px] text-muted-foreground">{ticket.ticket_type_name || ticket.category}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5"><i className={`size-1.5 rounded-full ${ticket.priority === "ALTA" || ticket.priority === "CRITICA" ? "bg-destructive" : ticket.priority === "MEDIA" ? "bg-primary" : "bg-muted-foreground"}`} />{priorityLabels[ticket.priority]}</span>
                    {ticket.sla_status && <StatusBadge value={ticket.sla_status} />}
                    <span className="truncate">{ticket.assignee_name ? `Resp.: ${ticket.assignee_name}` : "Sem responsável"}{isMine ? " (você)" : ""}</span>
                    <span className="ml-auto whitespace-nowrap">{timeAgo(ticket.updated_at)}</span>
                  </div>
                </button>
                <div className="absolute right-2 top-2.5">
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="size-8" aria-label={`Ações do chamado ${ticket.number}`} />}><MoreVertical /></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onOpenTicket(ticket)}><ExternalLink /> Abrir chamado</DropdownMenuItem>
                      {canAssume && <DropdownMenuItem onClick={() => handleAssume(ticket)}><HandMetal /> Assumir chamado</DropdownMenuItem>}
                      {canRemote && <DropdownMenuItem onClick={() => handleRemote(ticket)}><Headset /> Acesso remoto</DropdownMenuItem>}
                      {canResolve && <><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onClick={() => setResolveTarget(ticket)}><CheckCircle2 /> Resolver chamado</DropdownMenuItem></>}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </li>
            );
          })}
        </ul>
        </>
        )}
      </div>
      {filtered.length > 0 && (
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
      )}
    </Card>

    <ResolveTicketDialog
      open={Boolean(resolveTarget)}
      onOpenChange={(open) => !open && setResolveTarget(null)}
      onConfirm={handleResolve}
      loading={resolving}
    />

    <Dialog open={saveViewOpen} onOpenChange={setSaveViewOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Salvar visão</DialogTitle>
          <DialogDescription>Guarde a combinação atual de filtros para reutilizar com um clique.</DialogDescription>
        </DialogHeader>
        <Input autoFocus value={viewName} onChange={(event) => setViewName(event.target.value)} placeholder="Ex.: Meus críticos em aberto" onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); saveView(); } }} />
        <DialogFooter>
          <Button variant="outline" onClick={() => setSaveViewOpen(false)}>Cancelar</Button>
          <Button onClick={saveView} disabled={!viewName.trim()}><Save /> Salvar visão</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
