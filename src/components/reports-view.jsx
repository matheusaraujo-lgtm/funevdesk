"use client";

import { useCallback, useState } from "react";
import { AlertCircle, BarChart3, Building2, Clock3, Download, RefreshCw, Star, Target, Ticket, TrendingUp } from "lucide-react";
import { useReloadableData } from "@/lib/use-reloadable-data";
import { ListLoadingSkeleton } from "@/components/list-loading-skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const periodOptions = {
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
  "90d": "Últimos 90 dias",
  month: "Este mês",
  all: "Tudo",
};

function MetricCard({ icon: Icon, label, value, suffix = "", delta = null }) {
  return <Card className="rounded-2xl border-0 shadow-none ring-1 ring-foreground/10"><CardContent className="flex items-center gap-4 p-5"><span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15"><Icon className="size-5" /></span><div><p className="text-xs text-muted-foreground">{label}</p><div className="mt-1 flex items-baseline gap-2"><p className="font-heading text-2xl font-bold">{value}{suffix}</p>{delta != null && <span className={`text-xs font-semibold ${delta >= 0 ? "text-emerald-600" : "text-destructive"}`}>{delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}%</span>}</div></div></CardContent></Card>;
}

// Tendência diária: barras de criados (azul) vs. resolvidos (verde), sem dependências.
function TrendChart({ trend }) {
  if (!trend?.length) return <p className="py-6 text-center text-sm text-muted-foreground">Sem dados no período.</p>;
  const max = Math.max(1, ...trend.map((d) => Math.max(d.created, d.resolved)));
  return (
    <div>
      <div className="flex h-40 items-end gap-[3px]">
        {trend.map((d) => (
          <div key={d.day} className="flex flex-1 items-end justify-center gap-[2px]" title={`${d.day}: ${d.created} criados · ${d.resolved} resolvidos`}>
            <div className="w-full max-w-[7px] rounded-t bg-primary/70" style={{ height: `${Math.max(2, (d.created / max) * 100)}%` }} />
            <div className="w-full max-w-[7px] rounded-t bg-emerald-500/70" style={{ height: `${Math.max(2, (d.resolved / max) * 100)}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-primary/70" /> Criados</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-emerald-500/70" /> Resolvidos</span>
        <span className="ml-auto tabular-nums">{trend[0]?.day} – {trend[trend.length - 1]?.day}</span>
      </div>
    </div>
  );
}

function deltaPct(current, previous) {
  if (previous == null) return null;
  if (!previous) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 100);
}

const priorityLabels = { CRITICA: "Crítica", ALTA: "Alta", MEDIA: "Média", BAIXA: "Baixa" };

// Barra horizontal simples (sem dependências) para visualizar proporções.
function BarRow({ label, value, max, tone = "bg-primary" }) {
  const percent = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="truncate font-medium">{label}</span>
        <span className="shrink-0 tabular-nums text-muted-foreground">{value}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label={`${label}: ${value}`}>
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

// Exportação CSV client-side com BOM UTF-8 (mesmo padrão de assets-view.jsx).
function downloadCsv(fileName, rows) {
  const csv = rows.map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(";")).join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }));
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function ReportsView({ branchId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [period, setPeriod] = useState("30d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { loading, reload: load } = useReloadableData(useCallback(async () => {
    setError(false);
    const query = new URLSearchParams();
    if (branchId) query.set("branchId", branchId);
    // Intervalo de datas explícito tem prioridade; senão usa o atalho de período.
    if (from || to) {
      if (from) query.set("from", new Date(`${from}T00:00:00`).toISOString());
      if (to) query.set("to", new Date(`${to}T23:59:59`).toISOString());
    } else {
      query.set("period", period);
    }
    try {
      const response = await fetch(`/api/reports?${query.toString()}`, { cache: "no-store" });
      if (!response.ok) throw new Error("request failed");
      setData(await response.json());
    } catch {
      setError(true);
      setData(null);
    }
  }, [branchId, period, from, to]));

  function exportCsv() {
    if (!data) return;
    const { summary, byBranch, byPriority } = data;
    const rows = [
      ["Relatórios - exportação"],
      ["Período", from || to ? `${from || "—"} a ${to || "—"}` : periodOptions[period]],
      [],
      ["Indicador", "Valor"],
      ["Total de chamados", summary.totalTickets],
      ["Em aberto", summary.open],
      ["Resolvidos", summary.resolved],
      ["MTTR médio (h)", summary.mttrHours],
      ["1ª resposta média (h)", summary.firstResponseHours ?? 0],
      ["SLA 1ª resposta (%)", summary.firstResponseSlaPercent ?? "—"],
      ["Violações de SLA", summary.slaViolations],
      ["CSAT médio", summary.csatAverage ?? "—"],
      ["Resolução no 1º contato (FCR) %", summary.firstContactResolution],
      [],
      ["Por unidade", "Total", "Resolvidos"],
      ...byBranch.map((row) => [row.name, row.total, row.resolved]),
      [],
      ["Por prioridade", "Quantidade"],
      ...byPriority.map((row) => [row.priority, row.count]),
    ];
    downloadCsv("relatorios-exportacao.csv", rows);
  }

  const filters = (
    <div className="flex flex-wrap items-end gap-2">
      <div className="w-[170px] space-y-1.5">
        <p className="text-[11px] font-semibold">Período</p>
        <Select value={period} onValueChange={(value) => { setPeriod(value); setFrom(""); setTo(""); }} disabled={Boolean(from || to)}>
          <SelectTrigger className="w-full bg-card"><SelectValue>{(current) => periodOptions[current]}</SelectValue></SelectTrigger>
          <SelectContent>{Object.entries(periodOptions).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5"><p className="text-[11px] font-semibold">Início</p><Input type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} className="h-9 w-[150px] bg-card" /></div>
      <div className="space-y-1.5"><p className="text-[11px] font-semibold">Fim</p><Input type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} className="h-9 w-[150px] bg-card" /></div>
      {(from || to) && <Button variant="ghost" size="sm" className="h-9" onClick={() => { setFrom(""); setTo(""); }}>Limpar datas</Button>}
      <Button variant="outline" size="sm" className="h-9" onClick={exportCsv} disabled={!data}><Download /> Exportar CSV</Button>
    </div>
  );

  const header = (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/[0.07] via-card to-secondary/25 px-5 py-5 ring-1 ring-foreground/10 sm:px-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-start gap-3.5">
          <span className="hidden size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm sm:flex"><BarChart3 className="size-5" /></span>
          <div>
            <h1 className="page-title text-[26px]">Relatórios</h1>
            <p className="page-copy max-w-md">Indicadores de desempenho, SLA e satisfação.</p>
          </div>
        </div>
        {filters}
      </div>
    </div>
  );

  if (error) return (
    <div className="space-y-5 pb-6">
      {header}
      <Card className="rounded-2xl border-0 shadow-none ring-1 ring-foreground/10"><CardContent className="flex flex-col items-center gap-3 p-10 text-center">
        <div className="grid size-12 place-items-center rounded-xl bg-destructive/10 text-destructive"><AlertCircle className="size-6" /></div>
        <div><p className="font-heading text-base font-bold">Não foi possível carregar os relatórios</p><p className="mt-1 text-sm text-muted-foreground">Verifique sua conexão e tente novamente.</p></div>
        <Button onClick={load}><RefreshCw /> Tentar novamente</Button>
      </CardContent></Card>
    </div>
  );

  if (loading || !data) return (
    <div className="space-y-5 pb-6">
      {header}
      <ListLoadingSkeleton rows={8} />
    </div>
  );

  const { summary, byBranch, byPriority, trend, previous, byAgent = [] } = data;
  const maxBranchTotal = Math.max(0, ...byBranch.map((row) => row.total));
  const maxPriorityCount = Math.max(0, ...byPriority.map((row) => row.count));
  const maxAgentTotal = Math.max(0, ...byAgent.map((row) => row.total));

  return <div className="space-y-5 pb-6">
    {header}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <MetricCard icon={Ticket} label="Total de chamados" value={summary.totalTickets} delta={deltaPct(summary.totalTickets, previous?.totalTickets)} />
      <MetricCard icon={TrendingUp} label="Em aberto" value={summary.open} />
      <MetricCard icon={Target} label="Resolvidos" value={summary.resolved} delta={deltaPct(summary.resolved, previous?.resolved)} />
      <MetricCard icon={Clock3} label="MTTR médio" value={summary.mttrHours} suffix=" h" />
      <MetricCard icon={TrendingUp} label="1ª resposta (média)" value={summary.firstResponseHours ?? 0} suffix=" h" />
      <MetricCard icon={Target} label="SLA 1ª resposta" value={summary.firstResponseSlaPercent ?? "—"} suffix={summary.firstResponseSlaPercent != null ? "%" : ""} />
      <MetricCard icon={BarChart3} label="Violações de SLA" value={summary.slaViolations} />
      <MetricCard icon={Star} label="CSAT médio" value={summary.csatAverage ?? "—"} suffix={summary.csatAverage ? "/5" : ""} />
    </div>
    <Card className="gap-0 rounded-2xl border-0 py-0 shadow-none ring-1 ring-foreground/10"><CardHeader className="border-b px-5 py-4"><CardTitle className="flex items-center gap-3 text-[15px]"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><TrendingUp className="size-[18px]" /></span>Tendência — criados vs. resolvidos</CardTitle></CardHeader><CardContent className="px-5 py-5"><TrendChart trend={trend} /></CardContent></Card>
    <div className="grid gap-4 xl:grid-cols-2">
      <Card className="gap-0 rounded-2xl border-0 py-0 shadow-none ring-1 ring-foreground/10"><CardHeader className="border-b px-5 py-4"><CardTitle className="flex items-center gap-3 text-[15px]"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Building2 className="size-[18px]" /></span>Por unidade</CardTitle></CardHeader><CardContent className="space-y-4 px-5 py-5">
        {byBranch.length > 0 && <div className="space-y-2.5">{byBranch.map((row) => <BarRow key={`bar-${row.name}`} label={row.name} value={row.total} max={maxBranchTotal} />)}</div>}
        <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Unidade</TableHead><TableHead>Total</TableHead><TableHead>Resolvidos</TableHead></TableRow></TableHeader><TableBody>{byBranch.map((row) => <TableRow key={row.name}><TableCell>{row.name}</TableCell><TableCell>{row.total}</TableCell><TableCell>{row.resolved}</TableCell></TableRow>)}</TableBody></Table></div>
      </CardContent></Card>
      <Card className="gap-0 rounded-2xl border-0 py-0 shadow-none ring-1 ring-foreground/10"><CardHeader className="border-b px-5 py-4"><CardTitle className="flex items-center gap-3 text-[15px]"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><BarChart3 className="size-[18px]" /></span>Por prioridade</CardTitle></CardHeader><CardContent className="space-y-4 px-5 py-5">
        {byPriority.length > 0
          ? <div className="space-y-2.5">{byPriority.map((row) => <BarRow key={`bar-${row.priority}`} label={priorityLabels[row.priority] || row.priority} value={row.count} max={maxPriorityCount} tone={row.priority === "CRITICA" || row.priority === "ALTA" ? "bg-destructive" : "bg-primary"} />)}</div>
          : <p className="py-2 text-sm text-muted-foreground">Sem chamados no período.</p>}
        <p className="border-t pt-3 text-xs text-muted-foreground">Resolução no 1º contato (FCR): {summary.firstContactResolution}%</p>
      </CardContent></Card>
    </div>
    {byAgent.length > 0 && (
      <Card className="gap-0 rounded-2xl border-0 py-0 shadow-none ring-1 ring-foreground/10"><CardHeader className="border-b px-5 py-4"><CardTitle className="flex items-center gap-3 text-[15px]"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Star className="size-[18px]" /></span>Por responsável</CardTitle></CardHeader><CardContent className="space-y-2.5 px-5 py-5">
        {byAgent.map((row) => <BarRow key={row.name} label={`${row.name} · ${row.resolved}/${row.total} resolvidos`} value={row.total} max={maxAgentTotal} />)}
      </CardContent></Card>
    )}
  </div>;
}
