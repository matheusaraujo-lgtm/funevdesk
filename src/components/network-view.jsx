"use client";

import { createElement, useCallback, useMemo, useRef, useState } from "react";
import { Activity, AlertTriangle, Clock3, FileSpreadsheet, Gauge, MoreVertical, Network, Pencil, Plus, Printer, Radar, RefreshCw, Search, Server, ShieldCheck, Trash2, Upload, Wifi, X } from "lucide-react";
import { toast } from "sonner";
import { timeAgo } from "@/lib/utils";
import { ListEmptyState } from "@/components/list-empty-state";
import { ListLoadingSkeleton } from "@/components/list-loading-skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useReloadableData } from "@/lib/use-reloadable-data";

function variant(status) {
  if (status === "ONLINE") return "success";
  if (status === "ALERTA") return "warning";
  if (status === "OFFLINE") return "destructive";
  return "muted";
}

const monitorLabels = { PING: "Ping/portas", SMB: "SMB", FIREWALL: "Firewall", PRINTER: "Impressora" };

function parseMetrics(device) {
  try {
    return device.metrics_json ? JSON.parse(device.metrics_json) : {};
  } catch {
    return {};
  }
}

function profileIcon(type) {
  if (type === "FIREWALL") return ShieldCheck;
  if (type === "SMB") return Server;
  if (type === "PRINTER") return Printer;
  return Network;
}

function HealthSummary({ device }) {
  const metrics = parseMetrics(device);
  if (device.monitor_type === "PRINTER" && metrics.printer?.supplies?.length) {
    const lowest = [...metrics.printer.supplies].sort((a, b) => a.percent - b.percent)[0];
    return <span className="text-xs">{lowest.name}: <strong>{lowest.percent}%</strong></span>;
  }
  if (device.monitor_type === "SMB") {
    return <span className="text-xs">{metrics.smb?.available ? "SMB disponível" : "SMB sem resposta"}</span>;
  }
  if (metrics.openPorts?.length) return <span className="text-xs">Portas: {metrics.openPorts.join(", ")}</span>;
  return <span className="text-xs text-muted-foreground">{device.last_error || "Sem métricas"}</span>;
}

function MetricCard({ icon: Icon, label, value, detail }) {
  return (
    <Card className="rounded-2xl border-0 shadow-none ring-1 ring-foreground/10">
      <CardContent className="p-5">
        <div className="flex items-center gap-3">
          {Icon && (
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icon className="size-5" />
            </span>
          )}
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-0.5 text-2xl font-bold leading-tight">{value}</p>
          </div>
        </div>
        {detail && <p className="mt-3 text-[11px] text-muted-foreground">{detail}</p>}
      </CardContent>
    </Card>
  );
}

function DeviceSidePanel({ device, permissions, onClose, onEdit, onRemove }) {
  const metrics = parseMetrics(device);
  const icon = profileIcon(device.monitor_type);
  return <Card className="h-fit gap-0 rounded-2xl border-0 py-0 shadow-none ring-1 ring-foreground/10 lg:sticky lg:top-24">
    <div className="flex items-center justify-between gap-3 border-b p-5"><div className="flex min-w-0 items-center gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">{createElement(icon, { className: "size-[18px]" })}</span><p className="truncate font-heading font-bold">{device.name}</p></div><Button variant="ghost" size="icon" className="size-8" onClick={onClose}><X /></Button></div>
    <div className="space-y-4 p-5">
      <div className="flex flex-wrap items-center gap-2"><Badge variant={variant(device.status)}>{device.status}</Badge><Badge variant="outline">{createElement(icon, { className: "size-3" })}{monitorLabels[device.monitor_type] || "Ping/portas"}</Badge>{device.vendor && <Badge variant="secondary">{device.vendor}</Badge>}</div>
      <p className="text-sm text-muted-foreground">{device.branch_name} · {device.device_type}</p>
      <div className="grid gap-3 text-sm">
        <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">IP</span><span className="font-medium">{device.ip_address}</span></div>
        <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">Latência</span><span className="font-medium">{device.latency_ms ?? "N/D"} ms</span></div>
        <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">Última resposta</span><span className="font-medium">{timeAgo(device.last_seen_at)}</span></div>
      </div>
      <Separator />
      <div className="space-y-3 text-sm">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Métricas</p>
        {metrics.ports?.length ? <div className="flex flex-wrap gap-1.5">{metrics.ports.map((port) => <Badge key={port.port} variant={port.open ? "success" : "muted"}>{port.port} {port.open ? "aberta" : "fechada"}</Badge>)}</div> : <p className="text-muted-foreground">Nenhuma verificação executada ainda.</p>}
        {device.monitor_type === "SMB" && <p className="text-muted-foreground">Compartilhamento: <span className="font-medium text-foreground">{device.smb_share || "não informado"}</span></p>}
        {device.monitor_type === "PRINTER" && (
          <div className="space-y-2">
            <p className="text-muted-foreground">SNMP: <span className="font-medium text-foreground">{metrics.snmpOk ? "respondendo" : device.snmp_community ? "sem resposta" : "não configurado"}</span></p>
            {metrics.printer?.supplies?.map((supply) => (
              <div key={supply.name} className="rounded-lg border p-2">
                <div className="flex items-center justify-between gap-2"><span className="truncate">{supply.name}</span><Badge variant={supply.percent <= 15 ? "destructive" : "success"}>{supply.percent}%</Badge></div>
              </div>
            ))}
          </div>
        )}
      </div>
      {device.last_error && <><Separator /><p className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">{device.last_error}</p></>}
      {device.notes && <><Separator /><p className="text-sm text-muted-foreground">{device.notes}</p></>}
    </div>
    {permissions.canConfigure && <div className="grid gap-2 border-t p-5"><Button size="sm" variant="secondary" onClick={() => onEdit(device)}><Pencil /> Editar</Button><Button size="sm" variant="destructive" onClick={() => onRemove(device)}><Trash2 /> Excluir</Button></div>}
  </Card>;
}

export function NetworkView({ permissions, branchId = "", onNew, onEdit }) {
  const fileInputRef = useRef(null);
  const [devices, setDevices] = useState([]);
  const [checking, setChecking] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { loading, reload: load } = useReloadableData(useCallback(async () => {
    const response = await fetch("/api/network", { cache: "no-store" });
    // Impressoras têm tela própria (aba Impressoras); aqui só rede/segurança.
    if (response.ok) setDevices((await response.json()).devices.filter((device) => device.monitor_type !== "PRINTER"));
  }, []));

  // Escopo pela unidade selecionada no topo.
  const branchDevices = useMemo(() => (branchId ? devices.filter((device) => device.branch_id === branchId) : devices), [devices, branchId]);
  const filtered = useMemo(() => branchDevices.filter((device) => `${device.name} ${device.device_type} ${device.monitor_type || ""} ${device.vendor || ""} ${device.ip_address} ${device.branch_name}`.toLowerCase().includes(search.toLowerCase())), [branchDevices, search]);
  const selected = branchDevices.find((device) => device.id === selectedId) || null;
  const online = branchDevices.filter((device) => device.status === "ONLINE").length;
  const alerts = branchDevices.filter((device) => device.status === "ALERTA" || device.status === "OFFLINE").length;
  const averageLatency = branchDevices.filter((device) => device.latency_ms != null).length
    ? Math.round(branchDevices.filter((device) => device.latency_ms != null).reduce((sum, device) => sum + Number(device.latency_ms || 0), 0) / branchDevices.filter((device) => device.latency_ms != null).length)
    : null;
  const lastCheck = branchDevices.map((device) => device.last_seen_at).filter(Boolean).sort().at(-1);

  async function checkNow() {
    setChecking(true);
    const response = await fetch("/api/network/check", { method: "POST" });
    const result = await response.json().catch(() => ({}));
    setChecking(false);
    if (!response.ok) return toast.error(result.error || "Não foi possível verificar a rede.");
    toast.success(`${result.checked} dispositivo(s) verificado(s).`);
    if (result.devices) setDevices(result.devices.filter((device) => device.monitor_type !== "PRINTER"));
    else load();
  }

  async function remove(device) {
    const response = await fetch(`/api/network/${device.id}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) return toast.error(result.error || "Não foi possível excluir o dispositivo.");
    toast.success("Dispositivo excluído.");
    if (selectedId === device.id) setSelectedId(null);
    load();
  }

  const spreadsheetHeader = ["name", "branchId", "deviceType", "ipAddress", "monitorType", "vendor", "checkPorts", "snmpCommunity", "smbShare", "notes"];

  function downloadCsv(fileName, rows) {
    const csv = [spreadsheetHeader, ...rows].map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(";")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function downloadTemplate() {
    downloadCsv("modelo-importacao-rede.csv", [
      ["Switch-Core", "branch_matriz", "Switch", "192.168.1.1", "PING", "Cisco", "22,80,443", "", "", "Core da matriz"],
      ["FILESERVER", "branch_matriz", "Servidor SMB", "192.168.1.10", "SMB", "", "445,139", "", "publico", "Compartilhamento principal"],
    ]);
    toast.info("Modelo baixado. Use o branchId da unidade desejada.");
  }

  function parseCsv(text) {
    const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
    const columns = lines[0].split(";").map((item) => item.replace(/^"|"$/g, "").trim());
    return lines.slice(1).map((line) => {
      const values = line.match(/("([^"]|"")*"|[^;]+)/g)?.map((item) => item.replace(/^"|"$/g, "").replaceAll('""', '"').trim()) || [];
      return Object.fromEntries(columns.map((column, index) => [column, values[index] || ""]));
    });
  }

  async function importDevices(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const rows = parseCsv(await file.text());
    const response = await fetch("/api/network", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rows }) });
    const result = await response.json();
    if (!response.ok) return toast.error(result.error || "Não foi possível importar a planilha.");
    toast.success(`${result.imported} dispositivo(s) importado(s).`);
    load();
  }

  return <div className="space-y-5 pb-6">
    {/* Header em destaque, no mesmo estilo do restante do app. */}
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/[0.07] via-card to-secondary/25 px-5 py-5 ring-1 ring-foreground/10 sm:px-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-start gap-3.5">
          <span className="hidden size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm sm:flex"><Radar className="size-5" /></span>
          <div>
            <h1 className="page-title text-[26px]">Monitoramento de rede</h1>
            <p className="page-copy max-w-md">Servidores, firewalls e links monitorados por ping, portas e latência.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2"><input ref={fileInputRef} className="hidden" type="file" accept=".csv,text/csv" onChange={importDevices} />{permissions.canConfigure && <Button variant="outline" onClick={downloadTemplate}><FileSpreadsheet /> Modelo</Button>}{permissions.canConfigure && <Button variant="outline" onClick={() => fileInputRef.current?.click()}><Upload /> Importar</Button>}<Button variant="outline" onClick={load}><RefreshCw /> Atualizar</Button><Button onClick={checkNow} disabled={checking}><Activity className={checking ? "animate-pulse" : undefined} /> {checking ? "Verificando..." : "Verificar agora"}</Button>{permissions.canConfigure && <Button variant="secondary" onClick={onNew}><Plus /> Novo monitoramento</Button>}</div>
      </div>
    </div>
    <div className="grid gap-4 sm:grid-cols-4"><MetricCard icon={Network} label="Dispositivos" value={branchDevices.length} detail="Inventário de rede" /><MetricCard icon={Wifi} label="Online" value={online} detail={`${devices.length ? Math.round((online / devices.length) * 100) : 0}% disponíveis`} /><MetricCard icon={AlertTriangle} label="Alertas" value={alerts} detail="Alerta ou offline" /><MetricCard icon={Gauge} label="Latência média" value={averageLatency == null ? "N/D" : `${averageLatency} ms`} detail={lastCheck ? `Última resposta ${timeAgo(lastCheck)}` : "Sem verificação"} /></div>
    <div className={`grid items-start gap-4 ${selected ? "lg:grid-cols-[minmax(0,1fr)_320px]" : ""}`}>
      <Card className="gap-0 overflow-hidden rounded-2xl border-0 py-0 shadow-none ring-1 ring-foreground/10">
        <div className="border-b p-4"><div className="relative max-w-md"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar dispositivo..." /></div></div>
        {loading ? <ListLoadingSkeleton /> : filtered.length === 0 ? (
          <ListEmptyState
            icon={Network}
            title={search ? "Nenhum dispositivo encontrado" : "Nenhum dispositivo monitorado"}
            description={search ? "Tente outro termo de busca." : "Cadastre dispositivos de rede para monitoramento por unidade."}
            actionLabel={permissions.canConfigure && !search ? "Novo dispositivo" : undefined}
            onAction={permissions.canConfigure && !search ? onNew : undefined}
          />
        ) : (
          <div className="overflow-x-auto"><Table className="min-w-[1040px]"><TableHeader><TableRow className="bg-muted/10"><TableHead>Dispositivo</TableHead><TableHead>Perfil</TableHead><TableHead>Unidade</TableHead><TableHead>IP</TableHead><TableHead>Status</TableHead><TableHead>Saúde</TableHead><TableHead>Latência</TableHead><TableHead>Última resposta</TableHead><TableHead className="w-12" /></TableRow></TableHeader><TableBody>{filtered.map((device) => { const Icon = profileIcon(device.monitor_type); return <TableRow key={device.id} className={`cursor-pointer ${selectedId === device.id ? "border-l-2 border-l-primary bg-muted" : ""}`} onClick={() => setSelectedId(device.id)}><TableCell><p className="font-medium">{device.name}</p><p className="text-xs text-muted-foreground">{device.device_type}</p></TableCell><TableCell><Badge variant="outline"><Icon className="size-3" />{monitorLabels[device.monitor_type] || "Ping/portas"}</Badge></TableCell><TableCell>{device.branch_name}</TableCell><TableCell>{device.ip_address}</TableCell><TableCell><Badge variant={variant(device.status)}>{device.status}</Badge></TableCell><TableCell><HealthSummary device={device} /></TableCell><TableCell><span className="inline-flex items-center gap-1 text-xs"><Activity className="size-3.5 text-muted-foreground" />{device.latency_ms ?? "N/D"} ms</span></TableCell><TableCell><span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Clock3 className="size-3.5" />{timeAgo(device.last_seen_at)}</span></TableCell><TableCell onClick={(event) => event.stopPropagation()}>{permissions.canConfigure && <DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon" />}><MoreVertical /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => onEdit(device)}><Pencil /> Editar</DropdownMenuItem><DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(device)}><Trash2 /> Excluir</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}</TableCell></TableRow>; })}</TableBody></Table></div>
        )}
      </Card>
      {selected && <DeviceSidePanel device={selected} permissions={permissions} onClose={() => setSelectedId(null)} onEdit={onEdit} onRemove={setDeleteTarget} />}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(value) => !value && setDeleteTarget(null)}
        title="Excluir monitoramento"
        description={deleteTarget ? `Excluir "${deleteTarget.name}"? A exclusão só é permitida se não houver registros vinculados.` : ""}
        onConfirm={() => { const target = deleteTarget; setDeleteTarget(null); if (target) remove(target); }}
      />
    </div>
  </div>;
}
