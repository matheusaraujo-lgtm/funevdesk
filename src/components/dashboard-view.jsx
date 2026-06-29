"use client";

import { useMemo, useState } from "react";
import {
  Activity, AlertTriangle, CircleDot,
  HardDrive, LayoutDashboard, Monitor, MoreVertical, Printer, Server, ShieldAlert, ShieldCheck,
  TicketCheck, Tickets, UserRound, Wrench
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ListEmptyState } from "@/components/list-empty-state";
import { ListPagination, useListPagination } from "@/components/list-pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { formatPercent, timeAgo } from "@/lib/utils";

function initials(name = "Usuário") {
  return name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase();
}

const avatarTones = ["bg-primary/10 text-primary", "bg-secondary text-secondary-foreground", "bg-accent text-accent-foreground", "bg-muted text-muted-foreground"];
const priorityLabels = { BAIXA: "Baixa", MEDIA: "Média", ALTA: "Alta", CRITICA: "Crítica" };
const xdrSeverityLabels = { LOW: "Baixa", MEDIUM: "Média", HIGH: "Alta", CRITICAL: "Crítica" };
const xdrProviderLabels = { DEFENDER: "Microsoft Defender", SENTINELONE: "SentinelOne" };

function MetricCard({ icon: Icon, label, value, tone, onClick }) {
  const tones = {
    blue: { icon: "bg-primary/10 text-primary", bar: "bg-primary" },
    green: { icon: "bg-emerald-50 text-emerald-600", bar: "bg-emerald-500" },
    red: { icon: "bg-destructive/10 text-destructive", bar: "bg-destructive" },
    violet: { icon: "bg-violet-50 text-violet-600", bar: "bg-violet-500" },
  };
  const t = tones[tone];
  return (
    <Card
      className={`relative overflow-hidden rounded-2xl border-0 shadow-none ring-1 ring-foreground/10 ${onClick ? "cursor-pointer transition hover:-translate-y-0.5 hover:ring-primary/25" : ""}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onClick(); } } : undefined}
    >
      <span className={`absolute inset-y-0 left-0 w-1 ${t.bar}`} aria-hidden />
      <CardContent className="flex items-center justify-between gap-4 py-5 pr-5 pl-6">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
          <p className="mt-1.5 font-heading text-[30px] font-bold leading-none tracking-tight">{value.toLocaleString("pt-BR")}</p>
        </div>
        <div className={`grid size-11 shrink-0 place-items-center rounded-xl ${t.icon}`}><Icon className="size-5" /></div>
      </CardContent>
    </Card>
  );
}

function PanelHeader({ icon: Icon, title, onViewAll }) {
  return (
    <CardHeader className="flex flex-row items-center justify-between border-b px-6 py-4">
      <CardTitle className="flex items-center gap-2.5 font-heading text-[15px] font-semibold tracking-tight">
        {Icon && <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="size-[18px]" /></span>}
        {title}
      </CardTitle>
      {onViewAll && <Button variant="link" className="h-auto p-0 text-xs font-medium text-muted-foreground hover:text-foreground" onClick={onViewAll}>Ver todos</Button>}
    </CardHeader>
  );
}

function AgentAlerts({ assets, onViewAssets }) {
  const alerts = assets.filter((asset) => asset.status === "ALERT" || asset.cpu_percent >= 85 || asset.memory_percent >= 85 || asset.disk_percent >= 85).slice(0, 4);
  return (
    <Card className="gap-0 rounded-2xl border-0 py-0 shadow-none ring-1 ring-foreground/10">
      <PanelHeader icon={ShieldAlert} title="Alertas do agente" onViewAll={onViewAssets} />
      <CardContent className="p-0">
        {alerts.length ? alerts.map((asset, index) => {
          const metrics = [
            { value: Number(asset.cpu_percent || 0), label: "Uso de CPU alto", detail: `${formatPercent(asset.cpu_percent)} de uso`, icon: CircleDot },
            { value: Number(asset.memory_percent || 0), label: "Uso de memória alto", detail: `${formatPercent(asset.memory_percent)} de uso`, icon: Activity },
            { value: Number(asset.disk_percent || 0), label: "Pouco espaço em disco", detail: `${formatPercent(100 - asset.disk_percent)} livre`, icon: HardDrive },
          ].sort((a, b) => b.value - a.value);
          const alert = metrics[0];
          const critical = asset.status === "ALERT" || alert.value >= 90;
          const Icon = asset.asset_type === "REDE" ? Server : alert.icon;
          return (
            <div key={asset.id} className={`flex items-center gap-3 border-l-2 px-6 py-4 transition-colors hover:bg-muted/30 ${index > 0 ? "border-t border-border/60" : ""} ${critical ? "border-l-red-500" : "border-l-amber-500"}`}>
              <div className={`grid size-9 shrink-0 place-items-center rounded-xl ${critical ? "bg-destructive/10 text-destructive" : "bg-accent text-accent-foreground"}`}><Icon className="size-4" /></div>
              <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-semibold">{alert.label}</p><p className="mt-0.5 truncate text-[11px] text-muted-foreground">{asset.hostname} - {alert.detail}</p></div>
              <span className={`flex items-center gap-1 text-[10px] font-semibold ${critical ? "text-destructive" : "text-muted-foreground"}`}><i className={`size-1.5 rounded-full ${critical ? "bg-destructive" : "bg-primary"}`} />{critical ? "Crítico" : "Alerta"}</span>
            </div>
          );
        }) : (
          <p className="px-6 py-8 text-center text-xs text-muted-foreground">Nenhum alerta ativo no momento.</p>
        )}
      </CardContent>
    </Card>
  );
}

function IncidentDevices({ assets, onViewAssets }) {
  const incidents = assets.filter((asset) => asset.status !== "ONLINE" || asset.cpu_percent >= 85 || asset.memory_percent >= 85 || asset.disk_percent >= 85).slice(0, 5);
  return (
    <Card className="gap-0 rounded-2xl border-0 py-0 shadow-none ring-1 ring-foreground/10">
      <PanelHeader icon={Monitor} title="Dispositivos com incidente" onViewAll={onViewAssets} />
      <CardContent className="p-0">
        {incidents.length ? incidents.map((asset, index) => {
          const critical = asset.status === "ALERT" || asset.status === "OFFLINE";
          const Icon = asset.asset_type === "SERVIDOR" ? Server : asset.asset_type === "REDE" ? Printer : Monitor;
          const reason = asset.status === "OFFLINE" ? "Dispositivo desconectado" : asset.cpu_percent >= 85 ? "Uso de CPU acima do esperado" : asset.memory_percent >= 85 ? "Uso de memória acima do esperado" : "Pouco espaço em disco";
          return (
            <div key={asset.id} className={`flex items-center gap-3 px-6 py-4 transition-colors hover:bg-muted/30 ${index > 0 ? "border-t border-border/60" : ""}`}>
              <Icon className={`size-4 ${critical ? "text-destructive" : "text-primary"}`} />
              <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-semibold">{asset.hostname}</p><p className="mt-0.5 truncate text-[11px] text-muted-foreground">{reason}</p></div>
              <span className={`flex items-center gap-1 text-[10px] font-semibold ${critical ? "text-destructive" : "text-muted-foreground"}`}><i className={`size-1.5 rounded-full ${critical ? "bg-destructive" : "bg-primary"}`} />{critical ? "Crítico" : "Alerta"}</span>
            </div>
          );
        }) : (
          <p className="px-6 py-8 text-center text-xs text-muted-foreground">Todos os dispositivos operando normalmente.</p>
        )}
      </CardContent>
    </Card>
  );
}

function SecurityAlerts({ xdrAlerts }) {
  const alerts = xdrAlerts?.recent || [];
  const total = xdrAlerts?.count || 0;
  return (
    <Card className="gap-0 rounded-2xl border-0 py-0 shadow-none ring-1 ring-foreground/10">
      <CardHeader className="flex flex-row items-center justify-between border-b px-6 py-4">
        <CardTitle className="flex items-center gap-2.5 font-heading text-[15px] font-semibold tracking-tight">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><ShieldAlert className="size-[18px]" /></span> Segurança (XDR/EPP)
        </CardTitle>
        {total > 0 && <Badge variant="secondary">{total.toLocaleString("pt-BR")}</Badge>}
      </CardHeader>
      <CardContent className="p-0">
        {alerts.length ? alerts.map((alert, index) => {
          const severity = alert.severity || "MEDIUM";
          const critical = severity === "CRITICAL" || severity === "HIGH";
          const provider = xdrProviderLabels[alert.provider] || alert.provider;
          const target = alert.hostname || alert.branch_name || "Toda a organização";
          return (
            <div key={alert.id} className={`flex items-center gap-3 border-l-2 px-6 py-4 transition-colors hover:bg-muted/30 ${index > 0 ? "border-t border-border/60" : ""} ${critical ? "border-l-red-500" : "border-l-amber-500"}`}>
              <div className={`grid size-9 shrink-0 place-items-center rounded-xl ${critical ? "bg-destructive/10 text-destructive" : "bg-accent text-accent-foreground"}`}><ShieldAlert className="size-4" /></div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold">{alert.title}</p>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{provider} - {target}</p>
              </div>
              <span className={`flex items-center gap-1 text-[10px] font-semibold ${critical ? "text-destructive" : "text-muted-foreground"}`}><i className={`size-1.5 rounded-full ${critical ? "bg-destructive" : "bg-primary"}`} />{xdrSeverityLabels[severity] || severity}</span>
            </div>
          );
        }) : (
          <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
            <div className="grid size-10 place-items-center rounded-full bg-emerald-500/10 text-emerald-600"><ShieldCheck className="size-5" /></div>
            <p className="mt-1 text-xs text-muted-foreground">Nenhum alerta de segurança ativo.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TrendChart({ data = [] }) {
  const max = Math.max(1, ...data.map((point) => point.count));
  const total = data.reduce((sum, point) => sum + point.count, 0);
  return (
    <Card className="gap-0 rounded-2xl border-0 py-0 shadow-none ring-1 ring-foreground/10">
      <div className="flex items-center justify-between border-b px-5 py-3">
        <div>
          <p className="text-sm font-semibold">Abertura de chamados</p>
          <p className="text-[11px] text-muted-foreground">Últimos 14 dias</p>
        </div>
        <p className="text-xs text-muted-foreground"><span className="font-semibold text-foreground">{total}</span> no período</p>
      </div>
      <div className="px-5 py-4">
        <div className="flex h-24 items-end gap-1.5">
          {data.map((point) => (
            <div
              key={point.key}
              className="flex-1 rounded-t bg-primary/70 transition-colors hover:bg-primary"
              style={{ height: point.count ? `${Math.max(6, (point.count / max) * 100)}%` : "2px" }}
              title={`${point.label}: ${point.count} chamado(s)`}
            />
          ))}
        </div>
        <div className="mt-1.5 flex gap-1.5">
          {data.map((point, index) => (
            <span key={point.key} className="flex-1 text-center text-[9px] leading-none text-muted-foreground">
              {index % 3 === 0 || index === data.length - 1 ? point.label.slice(0, 5) : ""}
            </span>
          ))}
        </div>
      </div>
    </Card>
  );
}

export function DashboardView({ data, currentUser, openTicket, onNavigate, onNavigateQueue, onNewTicket }) {
  const goToQueue = (target) => (onNavigateQueue ? onNavigateQueue(target) : onNavigate?.("tickets"));
  const [status, setStatus] = useState("all");
  const [period, setPeriod] = useState("all");
  const [now] = useState(() => Date.now());
  // Situações ativas (não-terminais) vindas da configuração — alimenta o filtro dinamicamente.
  const activeStatuses = (data.ticketStatuses || []).filter((item) => !item.is_terminal);

  const periodFilteredTickets = useMemo(() => {
    if (period === "all") return data.tickets;
    const days = period === "7d" ? 7 : 30;
    const cutoff = now - days * 24 * 60 * 60 * 1000;
    return data.tickets.filter((ticket) => new Date(ticket.updated_at || ticket.created_at).getTime() >= cutoff);
  }, [data.tickets, now, period]);

  // Tendência de abertura: chamados criados por dia nos últimos 14 dias.
  const trend = useMemo(() => {
    const days = 14;
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const startMs = start.getTime() - (days - 1) * 86400000;
    const buckets = Array.from({ length: days }, (_, index) => {
      const date = new Date(startMs + index * 86400000);
      return { key: index, label: date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }), count: 0 };
    });
    for (const ticket of data.tickets) {
      const created = new Date(ticket.created_at).getTime();
      const index = Math.floor((created - startMs) / 86400000);
      if (index >= 0 && index < days) buckets[index].count += 1;
    }
    return buckets;
  }, [data.tickets, now]);

  const filteredTickets = useMemo(
    () => periodFilteredTickets.filter((ticket) => ticket.status !== "RESOLVIDO" && (status === "all" || ticket.status === status)),
    [periodFilteredTickets, status],
  );

  const pagination = useListPagination(filteredTickets.length, 5);
  const pagedTickets = pagination.sliceItems(filteredTickets);

  const inProgress = periodFilteredTickets.filter((ticket) => ticket.status === "EM_ATENDIMENTO").length;
  const critical = periodFilteredTickets.filter((ticket) => ticket.status !== "RESOLVIDO" && (ticket.priority === "CRITICA" || ticket.priority === "ALTA")).length;
  const unassigned = periodFilteredTickets.filter((ticket) => !ticket.assignee_id && ticket.status !== "RESOLVIDO").length;
  const mine = periodFilteredTickets.filter((ticket) => ticket.assignee_id === currentUser?.id && ticket.status !== "RESOLVIDO").length;
  const slaViolations = periodFilteredTickets.filter((ticket) => ticket.sla_status === "VIOLADO").length;

  // Painéis da direita só aparecem quando têm conteúdo; se nenhum tiver, "Chamados
  // recentes" ocupa a largura total. (Mesmos filtros usados dentro de cada painel.)
  const showAgentAlerts = data.assets.some((asset) => asset.status === "ALERT" || asset.cpu_percent >= 85 || asset.memory_percent >= 85 || asset.disk_percent >= 85);
  const showIncidents = data.assets.some((asset) => asset.status !== "ONLINE" || asset.cpu_percent >= 85 || asset.memory_percent >= 85 || asset.disk_percent >= 85);
  const showSecurity = Boolean(data.permissions?.canViewAssets && data.xdrAlerts?.recent?.length);
  const hasSidePanels = showAgentAlerts || showIncidents || showSecurity;

  return (
    <div className="space-y-5 pb-6">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/[0.07] via-card to-secondary/25 px-5 py-5 ring-1 ring-foreground/10 sm:px-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3.5">
            <span className="hidden size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm sm:flex"><LayoutDashboard className="size-5" /></span>
            <div>
              <h1 className="page-title text-[26px]">Visão geral</h1>
              <p className="page-copy max-w-md">Painel de controle do suporte técnico com dados em tempo real.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[140px] bg-card"><SelectValue placeholder="Período">{(value) => ({ all: "Todo período", "7d": "Últimos 7 dias", "30d": "Últimos 30 dias" }[value])}</SelectValue></SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Últimos 7 dias</SelectItem>
              <SelectItem value="30d">Últimos 30 dias</SelectItem>
              <SelectItem value="all">Todo período</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[165px] bg-card"><SelectValue placeholder="Situação">{(value) => value === "all" ? "Todas as situações" : (activeStatuses.find((item) => item.code === value)?.label || value)}</SelectValue></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as situações</SelectItem>
              {activeStatuses.map((item) => <SelectItem key={item.code} value={item.code}>{item.label}</SelectItem>)}
            </SelectContent>
          </Select>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {mine > 0 && (
          <Button variant="outline" size="sm" onClick={() => goToQueue("mine")}>
            <UserRound /> Meus chamados <Badge variant="secondary" className="ml-1">{mine}</Badge>
          </Button>
        )}
        {unassigned > 0 && (
          <Button variant="outline" size="sm" onClick={() => goToQueue("unassigned")}>
            <Wrench /> Não atribuídos <Badge variant="secondary" className="ml-1">{unassigned}</Badge>
          </Button>
        )}
        {slaViolations > 0 && (
          <Button variant="outline" size="sm" className="border-destructive/30 text-destructive" onClick={() => goToQueue("sla")}>
            <AlertTriangle /> SLA violado <Badge variant="destructive" className="ml-1">{slaViolations}</Badge>
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <MetricCard icon={Tickets} label="Chamados ativos" value={data.stats.openTickets} tone="blue" onClick={() => goToQueue("open")} />
        <MetricCard icon={TicketCheck} label="Em andamento" value={inProgress} tone="green" onClick={() => goToQueue("inprogress")} />
        <MetricCard icon={AlertTriangle} label="Prioridade alta/crítica" value={critical} tone="red" onClick={() => goToQueue("critical")} />
        <MetricCard icon={Monitor} label="Ativos monitorados" value={data.stats.assets} tone="violet" onClick={() => onNavigate?.("assets")} />
      </div>

      <TrendChart data={trend} />

      <div className={hasSidePanels ? "grid items-stretch gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(280px,.72fr)]" : ""}>
        <Card className="flex h-full flex-col gap-0 overflow-hidden rounded-2xl border-0 py-0 shadow-none ring-1 ring-foreground/10">
          <PanelHeader icon={Tickets} title="Chamados recentes" onViewAll={() => onNavigate?.("tickets")} />
          <div className="flex-1 overflow-hidden">
            {filteredTickets.length === 0 ? (
              <ListEmptyState
                icon={Tickets}
                title="Nenhum chamado encontrado"
                description="Não há chamados com os filtros selecionados. Abra um chamado ou ajuste o filtro de situação."
                actionLabel="Abrir chamado"
                onAction={onNewTicket}
              />
            ) : (
              <Table className="h-full table-fixed">
                <TableHeader>
                  <TableRow className="border-border/60 hover:bg-transparent [&_th]:text-[11px] [&_th]:font-medium [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground">
                    <TableHead className="w-9"><Checkbox aria-label="Selecionar todos" /></TableHead>
                    <TableHead className="w-16">ID</TableHead>
                    <TableHead className="w-[28%]">Título</TableHead>
                    <TableHead className="w-[24%]">Usuário</TableHead>
                    <TableHead className="w-[18%]">Situação</TableHead>
                    <TableHead className="w-[13%]">Prioridade</TableHead>
                    <TableHead className="w-[12%]">Atualizado</TableHead>
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedTickets.map((ticket, index) => {
                    const name = ticket.requester_name || ticket.hostname || "Automático";
                    return (
                      <TableRow key={ticket.id} className="h-[68px] cursor-pointer border-border/60 transition-colors hover:bg-muted/40" onClick={() => openTicket(ticket)}>
                        <TableCell className="px-2" onClick={(event) => event.stopPropagation()}><Checkbox aria-label={`Selecionar chamado ${ticket.number}`} /></TableCell>
                        <TableCell className="px-2 text-xs font-semibold">#{ticket.number}</TableCell>
                        <TableCell className="px-2"><p className="truncate text-xs font-medium">{ticket.title}</p></TableCell>
                        <TableCell className="px-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <Avatar className="size-7 shrink-0"><AvatarFallback className={avatarTones[index % avatarTones.length]}>{initials(name)}</AvatarFallback></Avatar>
                            <div className="min-w-0"><p className="truncate text-xs font-medium">{name}</p><p className="truncate text-[10px] text-muted-foreground">{ticket.branch_name}</p></div>
                          </div>
                        </TableCell>
                        <TableCell className="overflow-hidden px-2"><StatusBadge value={ticket.status} /></TableCell>
                        <TableCell className="px-2">
                          <div className="flex items-center gap-1.5 text-xs">
                            <i className={`size-1.5 shrink-0 rounded-full ${ticket.priority === "ALTA" || ticket.priority === "CRITICA" ? "bg-destructive" : ticket.priority === "MEDIA" ? "bg-primary" : "bg-muted-foreground"}`} />
                            <span className="truncate">{priorityLabels[ticket.priority]}</span>
                          </div>
                        </TableCell>
                        <TableCell className="truncate px-2 text-[11px] text-muted-foreground">{timeAgo(ticket.updated_at)}</TableCell>
                        <TableCell className="px-0"><Button variant="ghost" size="icon" className="size-8" onClick={(event) => { event.stopPropagation(); openTicket(ticket); }}><MoreVertical /></Button></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
          {filteredTickets.length > 0 && (
            <ListPagination
              totalItems={filteredTickets.length}
              page={pagination.page}
              pageSize={pagination.pageSize}
              totalPages={pagination.totalPages}
              start={pagination.start}
              end={pagination.end}
              onPageChange={pagination.setPage}
              itemLabel="chamados"
              className="mt-auto px-5 py-4"
            />
          )}
          {filteredTickets.length > 0 && (
            <div className="flex justify-end border-t border-border/60 px-6 py-3">
              <Button variant="link" className="h-auto p-0 text-xs font-medium" onClick={() => onNavigate?.("tickets")}>Ir para fila completa</Button>
            </div>
          )}
        </Card>

        {hasSidePanels && (
          <div className="grid h-full content-start gap-4">
            {showAgentAlerts && <AgentAlerts assets={data.assets} onViewAssets={() => onNavigate?.("assets")} />}
            {showIncidents && <IncidentDevices assets={data.assets} onViewAssets={() => onNavigate?.("assets")} />}
            {showSecurity && <SecurityAlerts xdrAlerts={data.xdrAlerts} />}
          </div>
        )}
      </div>
    </div>
  );
}
