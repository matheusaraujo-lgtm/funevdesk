"use client";

import { useCallback, useMemo, useState } from "react";
import { useReloadableData } from "@/lib/use-reloadable-data";
import { AlertTriangle, CheckCircle2, Clock3, Droplets, LoaderCircle, MapPin, MoreVertical, Pencil, Plus, Printer, RefreshCw, SlidersHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ListEmptyState } from "@/components/list-empty-state";
import { ListLoadingSkeleton } from "@/components/list-loading-skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn, timeAgo } from "@/lib/utils";
import { translateSupply } from "@/lib/printer-supplies";
import { PRINTER_ERROR_BITS, PRINTER_EXTRA_EVENTS } from "@/lib/printer-events";

const PRINTER_PORTS = [9100, 515, 631];
const PRINTER_BRANDS = ["HP", "Brother", "Epson", "Canon", "Lexmark", "Xerox", "Samsung", "Ricoh", "Kyocera", "OKI"];
const TONER_THRESHOLDS = [5, 10, 15, 20, 30];
const emptyForm = {
  branchId: "", name: "", ipAddress: "", snmpCommunity: "public", snmpVersion: "v1",
  vendorChoice: "", vendorCustom: "", notes: "",
  autoTicket: false, autoTicketToner: 5, autoTicketOnError: true,
};

function parseMetrics(device) {
  try {
    return device?.metrics_json ? JSON.parse(device.metrics_json) : {};
  } catch {
    return {};
  }
}

// Resume o estado de uma impressora para detecção/antecipação de problemas.
function summarize(device) {
  const metrics = parseMetrics(device);
  const supplies = metrics.printer?.supplies || [];
  const lowSupplies = metrics.printer?.lowSupplies || supplies.filter((item) => item.percent <= 15);
  const warnSupplies = supplies.filter((item) => item.percent > 15 && item.percent <= 30);
  const offline = device.status === "OFFLINE";
  const hasError = Boolean(metrics.printer?.errorState) || (Boolean(device.last_error) && metrics.snmpOk === false);
  const reasons = [];
  if (offline) reasons.push("Sem resposta da impressora");
  if (lowSupplies.length) reasons.push(`Toner crítico: ${lowSupplies.map((s) => translateSupply(s.name)).join(", ")}`);
  if (hasError) reasons.push(metrics.printer?.errorState ? `Erro: ${metrics.printer.errorState}` : (device.last_error || "Sem comunicação com a impressora"));
  if (!offline && !lowSupplies.length && warnSupplies.length) reasons.push(`Toner baixo: ${warnSupplies.map((s) => translateSupply(s.name)).join(", ")}`);
  const severity = offline || lowSupplies.length || hasError ? "critical" : warnSupplies.length ? "warning" : "ok";
  return { metrics, supplies, lowSupplies, warnSupplies, offline, hasError, reasons, severity, snmpOk: metrics.snmpOk };
}

// Brother (e alguns modelos) têm toner "gaugeless": o cartucho não mede o nível e
// reporta sempre ~máximo (ex.: 253/254) até disparar o sinal binário de "baixo".
// Mostrar 100% engana o usuário — nesses casos exibimos "OK" em vez do percentual.
function isGaugelessToner(device, supply) {
  if (!/brother/i.test(device?.vendor || "")) return false;
  const name = supply?.name || "";
  const isCartridge = /toner|ink|tinta/i.test(name) && !/drum|cilindro|fuser|fusor|belt|correia|waste|residual|maintenance|manuten|imaging|imagem/i.test(name);
  if (!isCartridge) return false;
  const max = Number(supply.max) || 0;
  const level = Number(supply.level) || 0;
  return max > 0 && level >= max - 1; // reportando "cheio" no gauge binário
}

function SupplyBar({ supply, gaugeless }) {
  if (gaugeless) {
    return (
      <div>
        <div className="mb-1 flex items-center justify-between text-[11px]">
          <span className="truncate font-medium">{translateSupply(supply.name)}</span>
          <span className="font-semibold text-emerald-600">OK</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-emerald-500/50" style={{ width: "100%" }} />
        </div>
        <p className="mt-0.5 text-[10px] text-muted-foreground">Sem leitura de nível — Brother só sinaliza “ok/baixo”.</p>
      </div>
    );
  }
  const p = Number(supply.percent) || 0;
  const tone = p <= 15 ? "bg-destructive" : p <= 30 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="truncate font-medium">{translateSupply(supply.name)}</span>
        <span className={cn("font-semibold tabular-nums", p <= 15 ? "text-destructive" : p <= 30 ? "text-amber-600" : "text-muted-foreground")}>{p}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full transition-all", tone)} style={{ width: `${p}%` }} />
      </div>
    </div>
  );
}

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

export function PrintersView({ branches = [], defaultBranchId, branchId = "", permissions }) {
  const [devices, setDevices] = useState([]);
  const [checking, setChecking] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [eventsCfg, setEventsCfg] = useState(null);
  const [savingEvents, setSavingEvents] = useState(false);
  const canConfigure = Boolean(permissions?.canConfigure);

  async function openAlerts() {
    setAlertsOpen(true);
    const response = await fetch("/api/printers/alerts", { cache: "no-store" });
    if (response.ok) setEventsCfg((await response.json()).events);
  }

  async function saveEvents() {
    setSavingEvents(true);
    const response = await fetch("/api/printers/alerts", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ events: eventsCfg }),
    });
    setSavingEvents(false);
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      return toast.error(result.error || "Não foi possível salvar os alertas.");
    }
    toast.success("Eventos de alerta salvos.");
    setAlertsOpen(false);
  }

  const { loading, reload: load } = useReloadableData(useCallback(async () => {
    const response = await fetch("/api/network", { cache: "no-store" });
    if (response.ok) {
      const data = await response.json();
      setDevices((data.devices || []).filter((device) => device.monitor_type === "PRINTER"));
    }
  }, []));

  // Respeita a unidade selecionada no topo: só mostra impressoras da filial atual
  // (quando "Todas as unidades", branchId vem vazio e mostra todas).
  const printers = useMemo(() => devices
    .filter((device) => !branchId || device.branch_id === branchId)
    .map((device) => ({ device, ...summarize(device) })), [devices, branchId]);
  const online = printers.filter((p) => !p.offline).length;
  const lowToner = printers.filter((p) => p.lowSupplies.length).length;
  const withIssues = printers.filter((p) => p.severity === "critical").length;

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function openNew() {
    setEditing(null);
    // Unidade já vem da que o usuário tem logada/selecionada.
    setForm({ ...emptyForm, branchId: defaultBranchId || branches[0]?.id || "" });
    setDialogOpen(true);
  }

  function openEdit(device) {
    setEditing(device);
    const known = PRINTER_BRANDS.includes(device.vendor);
    setForm({
      branchId: device.branch_id || defaultBranchId || branches[0]?.id || "",
      name: device.name || "",
      ipAddress: device.ip_address || "",
      snmpCommunity: device.snmp_community || "",
      snmpVersion: device.snmp_version || "v1",
      vendorChoice: known ? device.vendor : (device.vendor ? "Outro" : ""),
      vendorCustom: known ? "" : (device.vendor || ""),
      notes: device.notes || "",
      autoTicket: Boolean(device.auto_ticket),
      autoTicketToner: device.auto_ticket_toner || 5,
      autoTicketOnError: Boolean(device.auto_ticket_on_error),
    });
    setDialogOpen(true);
  }

  async function savePrinter(event) {
    event.preventDefault();
    if (!form.branchId) return toast.error("Unidade não definida para o usuário.");
    setSaving(true);
    const vendor = form.vendorChoice === "Outro" ? form.vendorCustom.trim() : (form.vendorChoice || "");
    const response = await fetch(editing ? `/api/network/${editing.id}` : "/api/network", {
      method: editing ? "PUT" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        branchId: form.branchId,
        name: form.name,
        deviceType: "Impressora",
        monitorType: "PRINTER",
        vendor,
        ipAddress: form.ipAddress,
        checkPorts: PRINTER_PORTS,
        snmpCommunity: form.snmpCommunity,
        snmpVersion: form.snmpVersion,
        smbShare: "",
        status: editing?.status || "DESCONHECIDO",
        latencyMs: editing?.latency_ms ?? 0,
        notes: form.notes,
        autoTicket: form.autoTicket,
        autoTicketToner: form.autoTicket ? Number(form.autoTicketToner) : null,
        autoTicketOnError: form.autoTicketOnError,
      }),
    });
    const result = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) return toast.error(result.error || "Não foi possível salvar a impressora.");
    toast.success(editing ? "Impressora atualizada." : "Impressora cadastrada.");
    setDialogOpen(false);
    load();
  }

  async function deletePrinter(device) {
    const response = await fetch(`/api/network/${device.id}`, { method: "DELETE" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return toast.error(result.error || "Não foi possível excluir a impressora.");
    toast.success("Impressora excluída.");
    load();
  }

  async function checkNow() {
    setChecking(true);
    const response = await fetch("/api/network/check", { method: "POST" });
    const result = await response.json().catch(() => ({}));
    setChecking(false);
    if (!response.ok) return toast.error(result.error || "Não foi possível verificar as impressoras.");
    toast.success(`${result.checked ?? 0} dispositivo(s) verificado(s).`);
    load();
  }

  return (
    <div className="space-y-5 pb-6">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/[0.07] via-card to-secondary/25 px-5 py-5 ring-1 ring-foreground/10 sm:px-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3.5">
            <span className="hidden size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm sm:flex"><Printer className="size-5" /></span>
            <div>
              <h1 className="page-title text-[26px]">Impressoras</h1>
              <p className="page-copy max-w-md">Toner, status e erros das impressoras — antecipe problemas antes que parem o trabalho.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={checkNow} disabled={checking}><RefreshCw className={checking ? "animate-spin" : undefined} /> {checking ? "Verificando..." : "Verificar agora"}</Button>
            {canConfigure && <Button variant="outline" onClick={openAlerts}><SlidersHorizontal /> Alertas</Button>}
            {canConfigure && <Button onClick={openNew}><Plus /> Nova impressora</Button>}
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard icon={Printer} label="Impressoras" value={printers.length} tone="blue" />
        <MetricCard icon={CheckCircle2} label="Online" value={online} tone="green" />
        <MetricCard icon={Droplets} label="Toner baixo" value={lowToner} tone="amber" />
        <MetricCard icon={AlertTriangle} label="Precisam de atenção" value={withIssues} tone="red" />
      </div>

      {loading ? (
        <Card className="rounded-2xl border-0 shadow-none ring-1 ring-foreground/10"><ListLoadingSkeleton /></Card>
      ) : printers.length === 0 ? (
        <Card className="rounded-2xl border-0 shadow-none ring-1 ring-foreground/10">
          <ListEmptyState
            icon={Printer}
            title="Nenhuma impressora cadastrada"
            description="Cadastre impressoras com SNMP para acompanhar toner, status e erros — e abrir chamados antes do problema."
            actionLabel={canConfigure ? "Nova impressora" : undefined}
            onAction={canConfigure ? openNew : undefined}
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {printers.map(({ device, supplies, severity, snmpOk }) => {
            const statusTone = device.status === "OFFLINE" ? "destructive" : device.status === "ALERTA" ? "warning" : "success";
            return (
              <Card key={device.id} className={cn("gap-0 rounded-2xl border-0 py-0 shadow-none ring-1", severity === "critical" ? "ring-destructive/30" : severity === "warning" ? "ring-amber-500/30" : "ring-foreground/10")}>
                <div className="flex items-start justify-between gap-3 border-b p-5">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Printer className="size-5" /></span>
                    <div className="min-w-0">
                      <p className="truncate font-heading text-sm font-bold">{device.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{device.vendor || "Impressora monitorada"}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Badge variant={statusTone}>{device.status === "OFFLINE" ? "Offline" : device.status === "ALERTA" ? "Alerta" : "Online"}</Badge>
                    {canConfigure && (
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="size-8" aria-label={`Gerenciar ${device.name}`} />}><MoreVertical /></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(device)}><Pencil /> Editar</DropdownMenuItem>
                          <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(device)}><Trash2 /> Excluir</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
                <div className="space-y-4 p-5 text-xs">
                  <div className="grid gap-1.5">
                    <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-1.5 text-muted-foreground"><MapPin className="size-3.5" />Unidade</span><span className="truncate font-medium">{device.branch_name || "N/D"}</span></div>
                    <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">IP</span><span className="font-medium">{device.ip_address || "N/D"}</span></div>
                    <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-1.5 text-muted-foreground"><Clock3 className="size-3.5" />Última leitura</span><span className="font-medium">{timeAgo(device.last_seen_at)}</span></div>
                  </div>

                  <div>
                    <p className="mb-2 flex items-center gap-1.5 font-medium"><Droplets className="size-3.5 text-muted-foreground" />Suprimentos</p>
                    {supplies.length ? (
                      <div className="space-y-2.5">{supplies.map((supply, index) => <SupplyBar key={`${supply.name}-${index}`} supply={supply} gaugeless={isGaugelessToner(device, supply)} />)}</div>
                    ) : (
                      <p className="text-muted-foreground">{snmpOk === false ? "SNMP sem resposta — sem leitura de toner." : device.snmp_community ? "Aguardando primeira leitura SNMP." : "SNMP não configurado para esta impressora."}</p>
                    )}
                  </div>

                  {device.last_error && (
                    <p className="rounded-lg border border-destructive/20 bg-destructive/5 p-2.5 text-[11px] text-destructive">{device.last_error}</p>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={savePrinter}>
            <DialogHeader>
              <DialogTitle>{editing ? "Editar impressora" : "Nova impressora"}</DialogTitle>
              <DialogDescription>Monitoramento por rede/SNMP — sem credenciais. A unidade é a do seu acesso.</DialogDescription>
            </DialogHeader>
            <div className="grid max-h-[65vh] gap-4 overflow-y-auto py-3 pr-1 sm:grid-cols-2">
              <div className="sm:col-span-2"><Label htmlFor="printer-name" className="mb-2 block">Nome</Label><Input id="printer-name" required value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="Ex.: PRINT-RH-01" /></div>
              <div><Label htmlFor="printer-ip" className="mb-2 block">IP ou hostname</Label><Input id="printer-ip" required value={form.ipAddress} onChange={(event) => update("ipAddress", event.target.value)} placeholder="192.168.1.50" /></div>
              <div><Label htmlFor="printer-vendor" className="mb-2 block">Fabricante</Label><Select value={form.vendorChoice || undefined} onValueChange={(value) => update("vendorChoice", value)}><SelectTrigger id="printer-vendor"><SelectValue placeholder="Selecione o fabricante">{(value) => value || "Selecione o fabricante"}</SelectValue></SelectTrigger><SelectContent>{PRINTER_BRANDS.map((brand) => <SelectItem key={brand} value={brand}>{brand}</SelectItem>)}<SelectItem value="Outro">Outro</SelectItem></SelectContent></Select></div>
              {form.vendorChoice === "Outro" && <div><Label htmlFor="printer-vendor-custom" className="mb-2 block">Fabricante (informe)</Label><Input id="printer-vendor-custom" value={form.vendorCustom} onChange={(event) => update("vendorCustom", event.target.value)} placeholder="Ex.: Pantum" /></div>}
              <div><Label htmlFor="printer-snmp" className="mb-2 block">Comunidade SNMP</Label><Input id="printer-snmp" value={form.snmpCommunity} onChange={(event) => update("snmpCommunity", event.target.value)} placeholder="public" /></div>
              <div><Label htmlFor="printer-snmp-version" className="mb-2 block">Versão SNMP</Label><Select value={form.snmpVersion} onValueChange={(value) => update("snmpVersion", value)}><SelectTrigger id="printer-snmp-version"><SelectValue>{(value) => (value === "v2c" ? "SNMP v2c" : "SNMP v1")}</SelectValue></SelectTrigger><SelectContent><SelectItem value="v1">SNMP v1</SelectItem><SelectItem value="v2c">SNMP v2c</SelectItem></SelectContent></Select></div>
              <div className="sm:col-span-2"><Label htmlFor="printer-notes" className="mb-2 block">Observações</Label><Textarea id="printer-notes" rows={2} value={form.notes} onChange={(event) => update("notes", event.target.value)} placeholder="Localização, setor, modelo..." /></div>

              {/* Chamado automático configurável */}
              <div className="sm:col-span-2 rounded-xl border border-primary/15 bg-primary/[0.03] p-3.5">
                <label className="flex cursor-pointer items-start gap-2.5">
                  <Checkbox className="mt-0.5" checked={form.autoTicket} onCheckedChange={(value) => update("autoTicket", Boolean(value))} />
                  <span>
                    <span className="block text-sm font-medium">Abrir chamado automaticamente</span>
                    <span className="block text-xs text-muted-foreground">O monitoramento abre um chamado quando detectar problema nesta impressora (sem duplicar enquanto houver um aberto).</span>
                  </span>
                </label>
                {form.autoTicket && (
                  <div className="mt-3 space-y-3 pl-7">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span>Quando o toner ficar abaixo de</span>
                      <Select value={String(form.autoTicketToner)} onValueChange={(value) => update("autoTicketToner", Number(value))}>
                        <SelectTrigger className="h-8 w-20"><SelectValue>{(value) => `${value}%`}</SelectValue></SelectTrigger>
                        <SelectContent>{TONER_THRESHOLDS.map((t) => <SelectItem key={t} value={String(t)}>{t}%</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <p className="text-[11px] text-muted-foreground">Os demais eventos (offline, atolamento, sem papel, etc.) seguem a configuração global no botão <strong>Alertas</strong>.</p>
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancelar</Button>
              <Button type="submit" disabled={saving || !canConfigure}>{saving ? <LoaderCircle className="animate-spin" /> : null}{editing ? "Salvar alterações" : "Cadastrar impressora"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={alertsOpen} onOpenChange={setAlertsOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Eventos que abrem chamado</DialogTitle>
            <DialogDescription>Vale para todas as impressoras com chamado automático ligado. Escolha quais situações devem abrir um chamado.</DialogDescription>
          </DialogHeader>
          {!eventsCfg ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Carregando…</div>
          ) : (
            <div className="max-h-[60vh] space-y-4 overflow-y-auto py-2 pr-1">
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Condições de monitoramento</p>
                <div className="space-y-1.5">
                  {PRINTER_EXTRA_EVENTS.map((event) => (
                    <label key={event.key} className="flex cursor-pointer items-center gap-2.5 rounded-md px-1 py-1 text-sm">
                      <Checkbox checked={Boolean(eventsCfg[event.key])} onCheckedChange={(value) => setEventsCfg((current) => ({ ...current, [event.key]: Boolean(value) }))} />
                      {event.label}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Erros reportados pela impressora</p>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {PRINTER_ERROR_BITS.map((event) => (
                    <label key={event.key} className="flex cursor-pointer items-center gap-2.5 rounded-md px-1 py-1 text-sm">
                      <Checkbox checked={Boolean(eventsCfg[event.key])} onCheckedChange={(value) => setEventsCfg((current) => ({ ...current, [event.key]: Boolean(value) }))} />
                      {event.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAlertsOpen(false)} disabled={savingEvents}>Cancelar</Button>
            <Button type="button" onClick={saveEvents} disabled={savingEvents || !eventsCfg}>{savingEvents ? <LoaderCircle className="animate-spin" /> : null}Salvar eventos</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(value) => !value && setDeleteTarget(null)}
        title="Excluir impressora"
        description={deleteTarget ? `Excluir a impressora "${deleteTarget.name}"? A exclusão só é permitida se não houver registros vinculados.` : ""}
        onConfirm={() => { const target = deleteTarget; setDeleteTarget(null); if (target) deletePrinter(target); }}
      />
    </div>
  );
}
