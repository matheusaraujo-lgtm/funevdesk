"use client";

import { useCallback, useState } from "react";
import { useReloadableData } from "@/lib/use-reloadable-data";
import {
  AlertTriangle, ChevronDown, Info, ListChecks, Loader2,
  RefreshCw, ScanLine, ShieldAlert, ShieldCheck, ShieldOff, Sparkles, Ticket, Wifi,
} from "lucide-react";
import { toast } from "sonner";
import { ListEmptyState } from "@/components/list-empty-state";
import { ListLoadingSkeleton } from "@/components/list-loading-skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn, timeAgo } from "@/lib/utils";
import { mitreForAlert } from "@/lib/mitre";

const SEVERITY_LABELS = { CRITICAL: "Crítica", HIGH: "Alta", MEDIUM: "Média", LOW: "Baixa" };
const SEVERITY_RING = { CRITICAL: "ring-destructive/40", HIGH: "ring-amber-500/40", MEDIUM: "ring-primary/30", LOW: "ring-foreground/10" };
const SEVERITY_PILL = {
  CRITICAL: "border-destructive/30 bg-destructive/10 text-destructive",
  HIGH: "border-amber-200 bg-amber-50 text-amber-700",
  MEDIUM: "border-blue-200 bg-blue-50 text-blue-700",
  LOW: "border-emerald-200 bg-emerald-50 text-emerald-700",
};
const PROVIDER_LABELS = { DEFENDER: "Microsoft Defender", WINDOWS_DEFENDER: "Microsoft Defender (agente)", SENTINELONE: "SentinelOne" };
const STATUS_LABELS = { NEW: "Novo", INVESTIGATING: "Em análise", RESOLVED: "Resolvido", FALSE_POSITIVE: "Falso positivo" };
const STATUS_PILL = {
  NEW: "border-destructive/30 bg-destructive/10 text-destructive",
  INVESTIGATING: "border-blue-200 bg-blue-50 text-blue-700",
  RESOLVED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  FALSE_POSITIVE: "border-border bg-muted text-muted-foreground",
};

function MetricCard({ icon: Icon, label, value, tone }) {
  const tones = { blue: "bg-primary/10 text-primary", green: "bg-emerald-50 text-emerald-600", amber: "bg-amber-50 text-amber-600", red: "bg-destructive/10 text-destructive" };
  return (
    <Card className="rounded-2xl border-0 shadow-none ring-1 ring-foreground/10">
      <CardContent className="flex items-center gap-4 p-5">
        <span className={cn("grid size-11 shrink-0 place-items-center rounded-xl", tones[tone])}><Icon className="size-5" /></span>
        <div><p className="text-[13px] text-muted-foreground">{label}</p><p className="mt-1 font-heading text-2xl font-bold leading-none">{value}</p></div>
      </CardContent>
    </Card>
  );
}

export function SecurityView({ permissions, onOpenTicket }) {
  const [data, setData] = useState(null);
  const [analysis, setAnalysis] = useState(null); // { alert, insight, loading }
  const [busy, setBusy] = useState("");

  const { loading, reload: load } = useReloadableData(useCallback(async () => {
    const response = await fetch("/api/security");
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return toast.error(result.error || "Não foi possível carregar a segurança.");
    setData(result);
  }, []));

  const canManage = data?.permissions?.canManageTickets;
  // Triagem por severidade: críticos primeiro (NEW antes de resolvidos no mesmo nível).
  const SEV_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  const STATUS_ORDER = { NEW: 0, INVESTIGATING: 1, RESOLVED: 2, FALSE_POSITIVE: 3 };
  const alerts = [...(data?.alerts || [])].sort((a, b) =>
    (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9)
    || (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9)
  );
  const sev = data?.counts?.bySeverity || {};
  const byStatus = data?.counts?.byStatus || {};
  const newCount = byStatus.NEW || 0;
  const criticalNew = (sev.CRITICAL || 0) + (sev.HIGH || 0);

  async function analyze(alert) {
    setAnalysis({ alert, insight: null, loading: true });
    const response = await fetch(`/api/security/${alert.id}/explain`, { method: "POST" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      setAnalysis(null);
      return toast.error(result.error || "Não foi possível analisar o alerta.");
    }
    setAnalysis({ alert, insight: result.insight, loading: false });
  }

  async function openTicket(alert) {
    setBusy(alert.id);
    const response = await fetch(`/api/security/${alert.id}/ticket`, { method: "POST" });
    const result = await response.json().catch(() => ({}));
    setBusy("");
    if (!response.ok) return toast.error(result.error || "Não foi possível abrir o chamado.");
    toast.success(result.ticket?.reused ? `Chamado #${result.ticket.number} já existia.` : `Chamado #${result.ticket.number} aberto.`);
    load();
  }

  async function respond(alert, action) {
    setBusy(alert.id);
    const response = await fetch(`/api/security/${alert.id}/respond`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const result = await response.json().catch(() => ({}));
    setBusy("");
    if (!response.ok) return toast.error(result.error || "Não foi possível enviar a ação.");
    toast.success(`"${result.label}" enviado ao equipamento. Será aplicado no próximo contato do agente.`);
  }

  async function changeStatus(alert, status) {
    setBusy(alert.id);
    const response = await fetch(`/api/security/${alert.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const result = await response.json().catch(() => ({}));
    setBusy("");
    if (!response.ok) return toast.error(result.error || "Não foi possível atualizar.");
    toast.success("Triagem atualizada.");
    load();
  }

  return (
    <div className="space-y-5 pb-6">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/[0.07] via-card to-secondary/25 px-5 py-5 ring-1 ring-foreground/10 sm:px-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3.5">
            <span className="hidden size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm sm:flex"><ShieldAlert className="size-5" /></span>
            <div>
              <h1 className="page-title text-[26px]">Segurança</h1>
              <p className="page-copy max-w-md">Ameaças detectadas pelo seu antivírus e ferramentas de segurança (XDR/EPP), traduzidas em linguagem simples — analise, faça a triagem e abra chamados de contenção.</p>
            </div>
          </div>
          <Button variant="outline" onClick={load} disabled={loading}><RefreshCw className={loading ? "animate-spin" : undefined} /> Atualizar</Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard icon={ShieldAlert} label="Novos alertas" value={newCount} tone="red" />
        <MetricCard icon={AlertTriangle} label="Críticos / Altos (novos)" value={criticalNew} tone="amber" />
        <MetricCard icon={Loader2} label="Em análise" value={byStatus.INVESTIGATING || 0} tone="blue" />
        <MetricCard icon={ShieldCheck} label="Resolvidos" value={byStatus.RESOLVED || 0} tone="green" />
      </div>

      <ConnectorsBanner connectors={data?.connectors} ingestConfigured={data?.ingestConfigured} aiEnabled={data?.aiEnabled} />

      {loading ? (
        <Card className="rounded-2xl border-0 shadow-none ring-1 ring-foreground/10"><ListLoadingSkeleton /></Card>
      ) : alerts.length === 0 ? (
        <Card className="rounded-2xl border-0 shadow-none ring-1 ring-foreground/10">
          <ListEmptyState
            icon={ShieldCheck}
            title="Nenhum alerta de segurança"
            description="Quando um provedor de XDR/EPP (Defender, SentinelOne, etc.) enviar alertas, eles aparecem aqui já traduzidos e prontos para triagem."
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              canManage={canManage}
              busy={busy === alert.id}
              onAnalyze={() => analyze(alert)}
              onOpenTicket={() => openTicket(alert)}
              onChangeStatus={(status) => changeStatus(alert, status)}
              onRespond={(action) => respond(alert, action)}
              onOpenLinkedTicket={() => alert.ticket_id && onOpenTicket?.(alert.ticket_id)}
            />
          ))}
        </div>
      )}

      <AnalysisDialog analysis={analysis} onClose={() => setAnalysis(null)} />
    </div>
  );
}

function ConnectorsBanner({ connectors = [], ingestConfigured, aiEnabled }) {
  const configured = connectors.filter((c) => c.configured);
  return (
    <Card className="rounded-2xl border-0 shadow-none ring-1 ring-foreground/10">
      <CardContent className="flex flex-wrap items-center gap-x-5 gap-y-2 p-4 text-xs">
        <span className="flex items-center gap-1.5 font-semibold"><ShieldCheck className="size-3.5 text-primary" /> Conectores</span>
        {connectors.map((c) => (
          <span key={c.name} className="flex items-center gap-1.5">
            <i className={cn("size-1.5 rounded-full", c.configured ? "bg-emerald-500" : "bg-muted-foreground/40")} />
            {c.label}: <span className={c.configured ? "text-emerald-600" : "text-muted-foreground"}>{c.configured ? "configurado" : "não configurado"}</span>
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <i className={cn("size-1.5 rounded-full", ingestConfigured ? "bg-emerald-500" : "bg-muted-foreground/40")} />
          Ingestão push: <span className={ingestConfigured ? "text-emerald-600" : "text-muted-foreground"}>{ingestConfigured ? "ativa" : "inativa"}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <Sparkles className={cn("size-3.5", aiEnabled ? "text-primary" : "text-muted-foreground/40")} />
          Analista IA: <span className={aiEnabled ? "text-primary" : "text-muted-foreground"}>{aiEnabled ? "ativo" : "só regras"}</span>
        </span>
      </CardContent>
    </Card>
  );
}

function AlertCard({ alert, canManage, busy, onAnalyze, onOpenTicket, onChangeStatus, onRespond, onOpenLinkedTicket }) {
  const provider = PROVIDER_LABELS[alert.provider] || alert.provider;
  const mitre = mitreForAlert(alert);
  return (
    <Card className={cn("rounded-2xl border-0 py-0 shadow-none ring-1", SEVERITY_RING[alert.severity] || "ring-foreground/10")}>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold", SEVERITY_PILL[alert.severity])}>{SEVERITY_LABELS[alert.severity] || alert.severity}</span>
            <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold", STATUS_PILL[alert.status])}>{STATUS_LABELS[alert.status] || alert.status}</span>
            {mitre && <span className="rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-700" title={`MITRE ATT&CK · ${mitre.tactic} (${mitre.tacticId}) · ${mitre.technique}`}>{mitre.techniqueId} · {mitre.tactic}</span>}
            <span className="text-[11px] text-muted-foreground">{provider}</span>
          </div>
          <p className="truncate text-sm font-semibold">{alert.title}</p>
          {alert.description && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{alert.description}</p>}
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            {alert.hostname && <span>🖥️ {alert.hostname}</span>}
            {alert.branch_name && <span>{alert.branch_name}</span>}
            <span>{timeAgo(alert.detected_at || alert.created_at)}</span>
            {alert.ticket_number && (
              <button type="button" onClick={onOpenLinkedTicket} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                <Ticket className="size-3" /> Chamado #{alert.ticket_number}
              </button>
            )}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onAnalyze}>
            <Sparkles className="size-3.5 text-primary" /> Analisar
          </Button>
          {canManage && !alert.ticket_number && (
            <Button size="sm" className="h-8 text-xs" onClick={onOpenTicket} disabled={busy}>
              <Ticket className="size-3.5" /> Abrir chamado
            </Button>
          )}
          {canManage && alert.asset_id && (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="h-8 text-xs" disabled={busy} />}>
                <ShieldAlert className="size-3.5 text-amber-600" /> Responder <ChevronDown className="size-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onRespond("ISOLATE")}><ShieldOff className="size-4" /> Isolar host da rede</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onRespond("UNISOLATE")}><Wifi className="size-4" /> Reconectar host</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onRespond("SCAN")}><ScanLine className="size-4" /> Varredura completa</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {canManage && (
            <Select value={alert.status} onValueChange={onChangeStatus} disabled={busy}>
              <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value} className="text-xs">{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function AnalysisDialog({ analysis, onClose }) {
  const insight = analysis?.insight;
  const sevStyle = insight ? SEVERITY_PILL[{ Crítica: "CRITICAL", Alta: "HIGH", Média: "MEDIUM", Baixa: "LOW" }[insight.severityLabel]] : "";
  return (
    <Dialog open={Boolean(analysis)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base"><Sparkles className="size-4 text-primary" /> Analista de Segurança</DialogTitle>
          <DialogDescription>Tradução da ameaça em linguagem simples, com triagem e contenção.</DialogDescription>
        </DialogHeader>

        {analysis?.loading && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Analisando o alerta...
          </div>
        )}

        {insight && (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-semibold leading-snug">{insight.titulo}</h3>
              {insight.severityLabel && <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold", sevStyle)}>{insight.severityLabel}</span>}
            </div>
            <Section icon={Info} title="O que aconteceu"><p className="text-sm text-muted-foreground">{insight.resumo}</p></Section>
            {insight.impacto && <Section icon={AlertTriangle} title="Possível impacto" tone="text-amber-600"><p className="text-sm text-muted-foreground">{insight.impacto}</p></Section>}
            {insight.acoes?.length > 0 && (
              <Section icon={ListChecks} title="Ações de contenção" tone="text-emerald-600">
                <ol className="ml-1 space-y-1.5">
                  {insight.acoes.map((acao, index) => (
                    <li key={index} className="flex gap-2 text-sm text-muted-foreground"><span className="font-semibold text-foreground">{index + 1}.</span><span>{acao}</span></li>
                  ))}
                </ol>
              </Section>
            )}
            <p className="border-t pt-2 text-[10px] text-muted-foreground">
              {insight.source === "deepseek" ? "Refinado pela IA (DeepSeek) sobre o motor de regras." : "Gerado pelo motor de regras. Configure DEEPSEEK_API_KEY para respostas mais ricas."}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Section({ icon: Icon, title, tone = "text-primary", children }) {
  return (
    <div>
      <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold"><Icon className={cn("size-3.5", tone)} /> {title}</p>
      {children}
    </div>
  );
}
