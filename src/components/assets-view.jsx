"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, AlertTriangle, CheckCircle2, ChevronDown, Cpu,
  Clock3, Download, ExternalLink, FileSpreadsheet, HardDrive, History, MessageSquarePlus, Monitor,
  MoreVertical, Network, PackageCheck, Power, PowerOff, Printer, RefreshCw, Search, Server, ShieldCheck, SlidersHorizontal,
  Trash2, Upload, UserRound, Wrench
} from "lucide-react";
import { toast } from "sonner";
import { AssetMetricsChart } from "@/components/asset-metrics-chart";
import { ListEmptyState } from "@/components/list-empty-state";
import { ListPagination, useListPagination } from "@/components/list-pagination";
import { formatPercent, timeAgo } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const assetLabels = { all: "Todos os tipos", NOTEBOOK: "Notebook", DESKTOP: "Desktop", SERVIDOR: "Servidor", IMPRESSORA: "Impressora", REDE: "Rede" };
const statusLabels = { all: "Todos os status", ONLINE: "Online", ALERT: "Com alerta", OFFLINE: "Offline" };
const iconTones = ["bg-primary/10 text-primary", "bg-secondary text-secondary-foreground", "bg-accent text-accent-foreground", "bg-destructive/10 text-destructive"];
const inventoryViews = {
  all: "Todos os ativos",
  computers: "Computadores",
  servers: "Servidores",
  firewalls: "Firewalls",
};

function assetTypeLabel(type) {
  return assetLabels[type] || type;
}

function AssetIcon({ asset, className = "size-4" }) {
  const Icon = asset.asset_type === "SERVIDOR" ? Server : asset.asset_type === "REDE" ? Network : asset.asset_type === "IMPRESSORA" ? FileSpreadsheet : Monitor;
  return <Icon className={className} />;
}

const assetTypeGroups = [
  { id: "all", label: "Todos os ativos", icon: Monitor },
  { id: "computers", label: "Computadores", icon: Monitor },
  { id: "servers", label: "Servidores", icon: Server },
  { id: "firewalls", label: "Firewalls", icon: ShieldCheck },
];

function healthLabel(asset) {
  if (!asset) return "Sem dados";
  if (asset.status === "OFFLINE") return "Offline";
  if (asset.status === "ALERT" || asset.cpu_percent >= 90 || asset.memory_percent >= 95 || asset.disk_percent >= 90) return "Crítico";
  if (asset.cpu_percent >= 75 || asset.memory_percent >= 85 || asset.disk_percent >= 80) return "Atenção";
  return "Saudável";
}

function MetricCard({ icon: Icon, label, value, detail, tone }) {
  const tones = {
    blue: "bg-primary/10 text-primary",
    green: "bg-secondary text-secondary-foreground",
    orange: "bg-accent text-accent-foreground",
    violet: "bg-muted text-muted-foreground",
    red: "bg-destructive/10 text-destructive",
  };
  return <Card className="rounded-2xl border-0 shadow-none ring-1 ring-foreground/10"><CardContent className="p-5">
    <div className="flex items-center gap-4"><div className={`grid size-11 place-items-center rounded-xl ${tones[tone]}`}><Icon className="size-5" /></div><div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-heading text-2xl font-bold">{value}</p></div></div>
    {detail && <p className="mt-4 text-[11px] text-muted-foreground">{detail}</p>}
  </CardContent></Card>;
}

function Filter({ label, value, onValueChange, options }) {
  return <div className="space-y-1.5"><p className="text-[11px] font-semibold">{label}</p><Select value={value} onValueChange={onValueChange}><SelectTrigger className="w-full bg-card"><SelectValue placeholder={options[value]}>{(current) => options[current]}</SelectValue></SelectTrigger><SelectContent>{Object.entries(options).map(([key, text]) => <SelectItem key={key} value={key}>{text}</SelectItem>)}</SelectContent></Select></div>;
}

function ResourceBar({ icon: Icon, label, value, suffix = "%", dangerAt = 90 }) {
  return <div>
    <div className="mb-2 flex items-center justify-between gap-4">
      <span className="flex items-center gap-2 font-medium"><Icon className="size-4 text-muted-foreground" />{label}</span>
      <span className={value >= dangerAt ? "font-semibold text-destructive" : ""}>{value}{suffix}</span>
    </div>
    <Progress value={value} className={value >= dangerAt ? "[&_[data-slot=progress-indicator]]:bg-destructive" : value >= dangerAt - 15 ? "[&_[data-slot=progress-indicator]]:bg-primary" : undefined} />
  </div>;
}

function parseNetworkMetrics(device) {
  try {
    return device?.metrics_json ? JSON.parse(device.metrics_json) : {};
  } catch {
    return {};
  }
}

function networkStatusVariant(status) {
  if (status === "ONLINE") return "success";
  if (status === "ALERTA") return "warning";
  if (status === "OFFLINE") return "destructive";
  return "muted";
}

function networkHealthText(device) {
  const metrics = parseNetworkMetrics(device);
  if (device.monitor_type === "PRINTER" && metrics.printer?.supplies?.length) {
    const lowest = [...metrics.printer.supplies].sort((a, b) => a.percent - b.percent)[0];
    return `${lowest.name}: ${lowest.percent}%`;
  }
  if (device.monitor_type === "FIREWALL") {
    return device.last_error || `${device.latency_ms ?? "N/D"} ms`;
  }
  if (device.monitor_type === "SMB") {
    return metrics.smb?.available ? "SMB disponivel" : "SMB sem resposta";
  }
  return device.last_error || "Monitorado";
}

function rowMatchesView(row, view) {
  if (view === "all") return true;
  if (view === "computers") return row.kind === "asset" && (row.asset.asset_type === "DESKTOP" || row.asset.asset_type === "NOTEBOOK");
  if (view === "printers") return row.kind === "asset" ? row.asset.asset_type === "IMPRESSORA" : row.device.monitor_type === "PRINTER";
  if (view === "servers") return row.kind === "asset" ? row.asset.asset_type === "SERVIDOR" : row.device.monitor_type === "SMB";
  if (view === "firewalls") return row.kind === "asset" ? row.asset.asset_type === "REDE" : row.device.monitor_type === "FIREWALL";
  return true;
}

function rowSearchText(row) {
  if (row.kind === "asset") {
    const asset = row.asset;
    return `${asset.hostname} ${asset.logged_user || ""} ${asset.ip_address || ""} ${asset.equipment_type || ""} ${asset.asset_type || ""}`;
  }
  const device = row.device;
  return `${device.name} ${device.device_type || ""} ${device.monitor_type || ""} ${device.vendor || ""} ${device.ip_address || ""} ${device.branch_name || ""}`;
}

export function AgentSummary({ asset, inventory, permissions, onToggleActive, onDelete }) {
  if (!asset) return null;
  const cpu = Math.round(Number(asset.cpu_percent || 0));
  const memory = Math.round(Number(asset.memory_percent || 0));
  const diskUsed = Math.round(Number(asset.disk_percent || 0));
  const diskFree = Math.round(Math.max(0, 100 - diskUsed));
  const health = healthLabel(asset);
  const healthVariant = health === "Saudável" ? "success" : health === "Atenção" ? "warning" : "destructive";
  const antivirusList = inventory?.antivirus || [];
  const hasAntivirusData = antivirusList.length > 0;
  const protectionName = hasAntivirusData ? (antivirusList[0]?.name || "Antivírus") : null;
  const isInactive = asset.active === 0;
  return <Card className="gap-0 rounded-2xl border-0 py-0 shadow-none ring-1 ring-foreground/10">
    <div className="flex items-center justify-between gap-2 border-b p-5">
      <p className="flex items-center gap-2.5 font-heading text-sm font-bold"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Activity className="size-[18px]" /></span>Saúde da máquina</p>
      <div className="flex items-center gap-2">
        {isInactive && <Badge variant="muted">Inativo</Badge>}
        <Badge variant={healthVariant}>{health}</Badge>
        {permissions?.canConfigure && (onToggleActive || onDelete) && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="size-8" aria-label="Gerenciar ativo" />}><MoreVertical /></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onToggleActive && (
                <DropdownMenuItem onClick={() => onToggleActive(asset)}>
                  {isInactive ? <><Power /> Reativar</> : <><PowerOff /> Desativar</>}
                </DropdownMenuItem>
              )}
              {onDelete && <DropdownMenuItem variant="destructive" onClick={() => onDelete(asset)}><Trash2 /> Excluir</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
    <div className="space-y-4 p-5">
      <div><p className="text-[11px] text-muted-foreground">Ativo</p><p className="mt-1 text-sm font-bold">{asset.hostname}</p><p className="text-xs text-muted-foreground">{asset.equipment_type || assetTypeLabel(asset.asset_type)}</p><p className="text-xs text-muted-foreground">Patrimônio: {asset.patrimony_number || "Não informado"}</p></div>
      <Separator />
      <div className="space-y-4 text-xs">
        <div className="flex items-center justify-between gap-4"><span className="flex items-center gap-2 font-medium"><Monitor className="size-4 text-muted-foreground" />IP local</span><span>{asset.ip_address || "Não informado"}</span></div>
        <div className="flex items-start justify-between gap-4"><span className="flex shrink-0 items-center gap-2 font-medium"><Server className="size-4 text-muted-foreground" />Sistema operacional</span><span className="text-right leading-snug" title={asset.os_name || ""}>{asset.os_name || "Não informado"}</span></div>
        <div className="flex items-center justify-between gap-4"><span className="flex items-center gap-2 font-medium"><Clock3 className="size-4 text-muted-foreground" />Última comunicação</span><span>{timeAgo(asset.last_seen_at)}</span></div>
        <ResourceBar icon={Cpu} label="CPU" value={cpu} />
        <ResourceBar icon={Activity} label="Memória" value={memory} dangerAt={95} />
        <ResourceBar icon={HardDrive} label="Disco usado" value={diskUsed} />
        <div className="flex items-center justify-between gap-4"><span className="flex items-center gap-2 font-medium"><HardDrive className="size-4 text-muted-foreground" />Espaço livre</span><span>{formatPercent(100 - diskUsed)}</span></div>
        <div className="flex items-center justify-between gap-4"><span className="flex items-center gap-2 font-medium"><ShieldCheck className="size-4 text-muted-foreground" />Proteção</span>{hasAntivirusData ? <Badge variant="success" className="max-w-[170px] truncate">{protectionName}</Badge> : <Badge variant="muted">Sem dados</Badge>}</div>
        <div className="flex items-center justify-between gap-4"><span className="flex items-center gap-2 font-medium"><CheckCircle2 className="size-4 text-muted-foreground" />Telemetria</span><Badge variant={asset.status === "OFFLINE" ? "destructive" : "success"}>{asset.status === "OFFLINE" ? "Sem comunicação" : "Atualizada"}</Badge></div>
        {(asset.serial_number || asset.machine_uuid || asset.agent_domain) && <div className="rounded-lg border bg-muted/30 p-2 text-[11px] text-muted-foreground"><p>Domínio: {asset.agent_domain || "N/D"}</p><p>Serial: {asset.serial_number || "N/D"}</p><p className="truncate">UUID: {asset.machine_uuid || "N/D"}</p></div>}
      </div>
    </div>
  </Card>;
}

export function InventoryPanel({ asset, inventory, loading }) {
  const [softwareOpen, setSoftwareOpen] = useState(false);
  const [softwareSearch, setSoftwareSearch] = useState("");
  if (!asset) return null;
  const software = inventory?.installedSoftware || [];
  const adapters = inventory?.networkAdapters || [];
  const antivirus = inventory?.antivirus || [];
  const security = inventory?.security || null;
  const term = softwareSearch.trim().toLowerCase();
  const filteredSoftware = term ? software.filter((item) => `${item.name || ""} ${item.publisher || ""}`.toLowerCase().includes(term)) : software;

  return <Card className="gap-0 rounded-2xl border-0 py-0 shadow-none ring-1 ring-foreground/10">
    <div className="flex items-center justify-between gap-3 border-b p-5">
      <p className="flex items-center gap-2.5 font-heading text-sm font-bold"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><PackageCheck className="size-[18px]" /></span>Inventário Windows</p>
      {inventory?.collectedAt && <span className="text-[11px] text-muted-foreground">{timeAgo(inventory.collectedAt)}</span>}
    </div>
    <div className="space-y-4 p-5 text-xs">
      {loading ? <p className="text-muted-foreground">Carregando inventário...</p> : !inventory ? <p className="text-muted-foreground">Sem inventário detalhado. Instale ou atualize o agente nesta máquina.</p> : (
        <>
          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-3"><span className="font-medium">Fabricante</span><span className="truncate text-right text-muted-foreground">{inventory.manufacturer || "N/D"}</span></div>
            <div className="flex items-center justify-between gap-3"><span className="font-medium">Modelo</span><span className="truncate text-right text-muted-foreground">{inventory.model || "N/D"}</span></div>
            <div className="flex items-center justify-between gap-3"><span className="font-medium">Processador</span><span className="max-w-[190px] truncate text-right text-muted-foreground">{inventory.processorName || "N/D"}</span></div>
            <div className="flex items-center justify-between gap-3"><span className="font-medium">Memória</span><span className="text-muted-foreground">{inventory.memoryTotalGb ? `${inventory.memoryTotalGb} GB` : "N/D"}</span></div>
            <div className="flex items-center justify-between gap-3"><span className="font-medium">Disco C:</span><span className="text-muted-foreground">{inventory.diskTotalGb ? `${inventory.diskFreeGb || 0}/${inventory.diskTotalGb} GB livres` : "N/D"}</span></div>
          </div>
          <Separator />
          <div>
            <p className="mb-2 flex items-center gap-2 font-medium"><Network className="size-4 text-muted-foreground" />Rede</p>
            <div className="space-y-2">
              {adapters.slice(0, 3).map((adapter, index) => <div key={`${adapter.macAddress || adapter.name}-${index}`} className="rounded-lg border bg-muted/20 p-2">
                <p className="truncate font-medium">{adapter.name || "Adaptador"}</p>
                <p className="truncate text-muted-foreground">{adapter.macAddress || "MAC N/D"} · {(adapter.ipv4 || []).join(", ") || "sem IPv4"}</p>
              </div>)}
              {!adapters.length && <p className="text-muted-foreground">Nenhum adaptador coletado.</p>}
            </div>
          </div>
          <Separator />
          <div>
            <p className="mb-2 flex items-center gap-2 font-medium"><ShieldCheck className="size-4 text-muted-foreground" />Segurança</p>
            <div className="flex flex-wrap gap-1.5">
              {antivirus.length ? antivirus.slice(0, 4).map((item, index) => <Badge key={`${item.name}-${index}`} variant="outline">{item.name || "Antivírus"}</Badge>) : <Badge variant="warning">Antivírus não informado</Badge>}
            </div>
            {security?.domain && <p className="mt-2 text-muted-foreground">Domínio: <span className="font-medium text-foreground">{security.domain}</span></p>}
            {security?.bitlocker?.length > 0 && (
              <p className="mt-2 text-muted-foreground">
                BitLocker: {security.bitlocker.map((item) => `${item.drive || "?"} (${item.protectionStatus === 1 ? "protegido" : "off"})`).join(", ")}
              </p>
            )}
            {security?.firewall?.length > 0 && (
              <p className="mt-2 text-muted-foreground">
                Firewall: {security.firewall.map((item) => `${item.name}: ${item.enabled ? "ativo" : "desativado"}`).join(" · ")}
              </p>
            )}
            {security?.pendingUpdates?.length > 0 && (
              <p className="mt-2 text-muted-foreground">Updates pendentes: <span className="font-medium text-foreground">{security.pendingUpdates.length}</span></p>
            )}

          </div>
          <Separator />
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="flex items-center gap-2 font-medium"><PackageCheck className="size-4 text-muted-foreground" />Softwares ({software.length})</p>
              {software.length > 6 && <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setSoftwareOpen(true)}>Ver todos</Button>}
            </div>
            <div className="space-y-1.5">
              {software.slice(0, 6).map((item, index) => <div key={`${item.name}-${index}`} className="flex items-center justify-between gap-2">
                <span className="truncate">{item.name}</span><span className="shrink-0 text-[11px] text-muted-foreground">{item.version || ""}</span>
              </div>)}
              {!software.length && <p className="text-muted-foreground">Nenhum software coletado.</p>}
            </div>
          </div>
        </>
      )}
    </div>
    <Dialog open={softwareOpen} onOpenChange={setSoftwareOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Softwares instalados</DialogTitle>
          <DialogDescription>{asset.hostname} · {software.length} programa(s)</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={softwareSearch} onChange={(event) => setSoftwareSearch(event.target.value)} placeholder="Buscar software..." className="pl-9" />
        </div>
        <div className="max-h-[55vh] divide-y overflow-y-auto rounded-lg border">
          {filteredSoftware.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">Nenhum software encontrado.</p>
          ) : filteredSoftware.map((item, index) => (
            <div key={`${item.name}-${index}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{item.name}</p>
                {item.publisher && <p className="truncate text-xs text-muted-foreground">{item.publisher}</p>}
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">{item.version || ""}</span>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  </Card>;
}

function NetworkDevicePanel({ device, permissions, onOpenMonitoring, onCheckNow }) {
  if (!device) return null;
  const metrics = parseNetworkMetrics(device);
  const isPrinter = device.monitor_type === "PRINTER";
  const isFirewall = device.monitor_type === "FIREWALL";

  const PanelIcon = isPrinter ? Printer : isFirewall ? ShieldCheck : Network;
  return <Card className="gap-0 rounded-2xl border-0 py-0 shadow-none ring-1 ring-foreground/10">
    <div className="flex items-center justify-between border-b p-5">
      <p className="flex items-center gap-2.5 font-heading text-sm font-bold"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><PanelIcon className="size-[18px]" /></span>{isPrinter ? "Monitoramento da impressora" : isFirewall ? "Monitoramento do firewall" : "Monitoramento de rede"}</p>
      <Badge variant={networkStatusVariant(device.status)}>{device.status || "DESCONHECIDO"}</Badge>
    </div>
    <div className="space-y-4 p-5 text-xs">
      <div>
        <p className="text-[11px] text-muted-foreground">Dispositivo</p>
        <p className="mt-1 text-sm font-bold">{device.name}</p>
        <p className="text-xs text-muted-foreground">{device.device_type || (isPrinter ? "Impressora" : "Dispositivo de rede")}</p>
      </div>
      <Separator />
      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">IP</span><span className="font-medium">{device.ip_address}</span></div>
        <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">Unidade</span><span className="font-medium">{device.branch_name}</span></div>
        <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">Latencia</span><span className="font-medium">{device.latency_ms ?? "N/D"} ms</span></div>
        <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">Última resposta</span><span className="font-medium">{timeAgo(device.last_seen_at)}</span></div>
        {device.vendor && <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">Fabricante</span><span className="font-medium">{device.vendor}</span></div>}
      </div>
      {isPrinter && (
        <>
          <Separator />
          <div className="space-y-2">
            <p className="font-medium">Suprimentos e SNMP</p>
            <p className="text-muted-foreground">SNMP: <span className="font-medium text-foreground">{metrics.snmpOk ? "respondendo" : device.snmp_community ? "sem resposta" : "não configurado"}</span></p>
            {metrics.printer?.supplies?.length ? metrics.printer.supplies.map((supply) => (
              <div key={supply.name} className="rounded-lg border p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate">{supply.name}</span>
                  <Badge variant={supply.percent <= 15 ? "destructive" : "success"}>{supply.percent}%</Badge>
                </div>
              </div>
            )) : <p className="text-muted-foreground">Sem leitura de toner/suprimentos ainda.</p>}
          </div>
        </>
      )}
      {(metrics.ports?.length || device.check_ports_json) && (
        <>
          <Separator />
          <div>
            <p className="mb-2 font-medium">Portas monitoradas</p>
            <div className="flex flex-wrap gap-1.5">
              {(metrics.ports || []).length ? metrics.ports.map((port) => <Badge key={port.port} variant={port.open ? "success" : "muted"}>{port.port} {port.open ? "aberta" : "fechada"}</Badge>) : <Badge variant="outline">{device.check_ports_json}</Badge>}
            </div>
          </div>
        </>
      )}
      {device.last_error && <p className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">{device.last_error}</p>}
      <div className="grid gap-2">
        <Button size="sm" onClick={onCheckNow}><RefreshCw /> Verificar agora</Button>
        {permissions.canConfigure && <Button size="sm" variant="outline" onClick={onOpenMonitoring}><Network /> Abrir monitoramento</Button>}
      </div>
    </div>
  </Card>;
}



export function AssetsView({ assets, allAssets, networkDevices = [], tickets, permissions, onNewTicket, onRemoteAccess, onRemoteAsset, onOpenTicket, onImported, onOpenMonitoring, onOpenAsset }) {
  const fileInputRef = useRef(null);
  const [selectedKey, setSelectedKey] = useState(assets[0]?.id ? `asset:${assets[0].id}` : "");
  const [search, setSearch] = useState("");
  const [inventoryView, setInventoryView] = useState("all");
  const [branch, setBranch] = useState("all");
  const [responsible, setResponsible] = useState("all");
  const [status, setStatus] = useState("all");
  const [system, setSystem] = useState("all");
  const [inventory, setInventory] = useState(null);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [toggleTarget, setToggleTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [actionPending, setActionPending] = useState(false);

  const rows = useMemo(() => [
    ...assets.map((asset) => ({ key: `asset:${asset.id}`, kind: "asset", asset })),
    ...networkDevices
      .filter((device) => ["FIREWALL", "SMB"].includes(device.monitor_type))
      .map((device) => ({ key: `network:${device.id}`, kind: "network", device })),
  ], [assets, networkDevices]);
  const branchOptions = useMemo(() => ({ all: "Todos os locais", ...Object.fromEntries([...new Set(rows.map((row) => row.kind === "asset" ? row.asset.branch_name : row.device.branch_name).filter(Boolean))].map((item) => [item, item])) }), [rows]);
  const responsibleOptions = useMemo(() => ({ all: "Todos os responsaveis", ...Object.fromEntries([...new Set(assets.map((asset) => asset.logged_user).filter(Boolean))].map((item) => [item, item])) }), [assets]);
  const systemOptions = useMemo(() => ({ all: "Todos os sistemas", ...Object.fromEntries([...new Set(assets.map((asset) => asset.os_name).filter(Boolean))].map((item) => [item, item])) }), [assets]);
  const filtered = useMemo(() => rows.filter((row) => {
    const term = search.trim().toLowerCase();
    const rowBranch = row.kind === "asset" ? row.asset.branch_name : row.device.branch_name;
    const rowResponsible = row.kind === "asset" ? row.asset.logged_user : "";
    const rowStatus = row.kind === "asset" ? row.asset.status : (row.device.status === "ALERTA" ? "ALERT" : row.device.status);
    const rowSystem = row.kind === "asset" ? row.asset.os_name : "";
    return (!term || rowSearchText(row).toLowerCase().includes(term))
      && rowMatchesView(row, inventoryView)
      && (branch === "all" || rowBranch === branch)
      && (responsible === "all" || rowResponsible === responsible)
      && (status === "all" || rowStatus === status)
      && (system === "all" || rowSystem === system);
  }), [rows, search, inventoryView, branch, responsible, status, system]);
  const selectedRow = rows.find((row) => row.key === selectedKey) || filtered[0] || rows[0];
  const selected = selectedRow?.kind === "asset" ? selectedRow.asset : null;
  const selectedDevice = selectedRow?.kind === "network" ? selectedRow.device : null;
  const pagination = useListPagination(filtered.length, 10);
  const pagedRows = pagination.sliceItems(filtered);

  const online = rows.filter((row) => row.kind === "asset" ? row.asset.status !== "OFFLINE" : row.device.status === "ONLINE").length;
  const alerts = rows.filter((row) => row.kind === "asset"
    ? row.asset.status === "ALERT" || row.asset.cpu_percent >= 85 || row.asset.memory_percent >= 85 || row.asset.disk_percent >= 85
    : row.device.status === "ALERTA" || row.device.status === "OFFLINE").length;
  const withoutAgent = assets.filter((asset) => asset.status === "OFFLINE").length;

  useEffect(() => {
    let ignore = false;
    async function loadInventory() {
      if (!selected?.id) {
        setInventory(null);
        return;
      }
      setInventoryLoading(true);
      const response = await fetch(`/api/assets/${selected.id}/inventory`, { cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (!ignore) {
        setInventory(response.ok ? result.inventory : null);
        setInventoryLoading(false);
      }
    }
    loadInventory();
    return () => { ignore = true; };
  }, [selected?.id]);

  function clearFilters() {
    setInventoryView("all"); setBranch("all"); setResponsible("all"); setStatus("all"); setSystem("all"); setSearch("");
  }

  const spreadsheetHeader = ["hostname", "branchId", "assetType", "equipmentType", "patrimonyNumber", "osName", "ipAddress", "loggedUser", "status"];

  function downloadCsv(fileName, rows) {
    const header = spreadsheetHeader;
    const csv = [header, ...rows].map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(";")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function exportInventory() {
    const csvRows = filtered.map((row) => {
      if (row.kind === "asset") {
        const asset = row.asset;
        return [asset.hostname, asset.branch_id, asset.asset_type, asset.equipment_type || asset.asset_type, asset.patrimony_number || "", asset.os_name || "", asset.ip_address || "", asset.logged_user || "", asset.status];
      }
      const device = row.device;
      return [device.name, device.branch_id, device.monitor_type, device.device_type || device.monitor_type, "", "", device.ip_address || "", "", device.status];
    });
    downloadCsv("ativos-exportacao.csv", csvRows);
  }

  async function downloadTemplate() {
    const response = await fetch("/api/assets?mode=template");
    const result = await response.json();
    const example = result.example;
    downloadCsv("modelo-importacao-ativos.csv", [[example.hostname, example.branchId, example.assetType, example.equipmentType, example.patrimonyNumber, example.osName, example.ipAddress, example.loggedUser, example.status]]);
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

  async function importInventory(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const rows = parseCsv(await file.text());
    const response = await fetch("/api/assets", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rows }) });
    const result = await response.json();
    if (!response.ok) return toast.error(result.error || "Não foi possível importar a planilha.");
    toast.success(`${result.imported} ativo(s) importado(s).`);
    onImported?.();
  }

  async function confirmToggleActive() {
    if (!toggleTarget) return;
    const nextActive = toggleTarget.active === 0;
    setActionPending(true);
    const response = await fetch(`/api/assets/${toggleTarget.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active: nextActive }),
    });
    const result = await response.json().catch(() => ({}));
    setActionPending(false);
    if (!response.ok) return toast.error(result.error || "Não foi possível atualizar o ativo.");
    toast.success(nextActive ? "Ativo reativado." : "Ativo desativado.");
    setToggleTarget(null);
    onImported?.();
  }

  async function confirmDeleteAsset() {
    if (!deleteTarget) return;
    setActionPending(true);
    const response = await fetch(`/api/assets/${deleteTarget.id}`, { method: "DELETE" });
    const result = await response.json().catch(() => ({}));
    setActionPending(false);
    if (response.status === 409) return toast.error(result.error || "Ativo possui termos vinculados e não pode ser excluído.");
    if (!response.ok) return toast.error(result.error || "Não foi possível excluir o ativo.");
    toast.success("Ativo excluído.");
    setDeleteTarget(null);
    onImported?.();
  }

  async function checkNetworkNow() {
    const response = await fetch("/api/network/check", { method: "POST" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return toast.error(result.error || "Não foi possível verificar a rede.");
    toast.success(`${result.checked} dispositivo(s) verificado(s).`);
    onImported?.();
  }

  return <div className="space-y-5 pb-6">
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/[0.07] via-card to-secondary/25 px-5 py-5 ring-1 ring-foreground/10 sm:px-6"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div className="flex items-start gap-3.5"><span className="hidden size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm sm:flex"><Monitor className="size-5" /></span><div><h1 className="page-title text-[26px]">Ativos</h1><p className="page-copy max-w-md">Inventário, telemetria do agente e acesso remoto por equipamento.</p></div></div><div className="flex flex-wrap gap-2"><input ref={fileInputRef} className="hidden" type="file" accept=".csv,text/csv" onChange={importInventory} /><DropdownMenu><DropdownMenuTrigger render={<Button variant="secondary" />}>{inventoryViews[inventoryView] || "Categoria"} <ChevronDown /></DropdownMenuTrigger><DropdownMenuContent align="start" className="w-56">{assetTypeGroups.map((item) => { const Icon = item.icon; return <DropdownMenuItem key={item.id} onClick={() => setInventoryView(item.id)}><Icon /> {item.label}</DropdownMenuItem>; })}</DropdownMenuContent></DropdownMenu><Button variant="outline" onClick={onImported}><RefreshCw /> Atualizar</Button><Button variant="outline" onClick={downloadTemplate}><FileSpreadsheet /> Modelo</Button><Button variant="outline" onClick={() => fileInputRef.current?.click()}><Upload /> Importar</Button><Button variant="outline" onClick={exportInventory}><Download /> Exportar</Button><DropdownMenu><DropdownMenuTrigger render={<Button variant="outline" />}>Ações <ChevronDown /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={onNewTicket}><MessageSquarePlus /> Abrir chamado</DropdownMenuItem><DropdownMenuItem onClick={clearFilters}><SlidersHorizontal /> Limpar filtros</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div></div></div>

    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <MetricCard icon={Monitor} label="Total de ativos" value={rows.length} detail="Inventário autorizado" tone="blue" />
      <MetricCard icon={HardDrive} label="Online" value={online} detail={`${Math.max(0, rows.length - online)} sem resposta`} tone="green" />
      <MetricCard icon={AlertTriangle} label="Com alerta" value={alerts} detail="CPU, memória ou disco" tone="orange" />
      <MetricCard icon={UserRound} label="Sem agente" value={withoutAgent} detail="Exigem instalação ou revisão" tone="violet" />
      <MetricCard icon={Wrench} label="Em manutenção" value={assets.filter((a) => a.lifecycle_status === "MANUTENCAO").length} detail="Ciclo CMDB" tone="blue" />
    </div>

    <Card className="gap-0 rounded-2xl border-0 py-0 shadow-none ring-1 ring-foreground/10"><CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[repeat(5,minmax(0,1fr))_auto] lg:items-end">
      <Filter label="Categoria" value={inventoryView} onValueChange={setInventoryView} options={inventoryViews} />
      <Filter label="Local" value={branch} onValueChange={setBranch} options={branchOptions} />
      <Filter label="Responsável" value={responsible} onValueChange={setResponsible} options={responsibleOptions} />
      <Filter label="Status do agente" value={status} onValueChange={setStatus} options={statusLabels} />
      <Filter label="Sistema operacional" value={system} onValueChange={setSystem} options={systemOptions} />
      <Button variant="secondary" size="sm" className="h-9" onClick={clearFilters}><SlidersHorizontal /> Limpar filtros</Button>
    </CardContent></Card>

    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_340px]">
      <Card className="gap-0 overflow-hidden rounded-2xl border-0 py-0 shadow-none ring-1 ring-foreground/10">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between"><p className="flex items-center gap-2.5 font-heading text-sm font-bold"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><HardDrive className="size-[18px]" /></span>Inventário de ativos ({filtered.length})</p><div className="relative w-full sm:w-[280px]"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} className="h-9 pl-9" placeholder="Buscar ativo..." /></div></div>
        <div className="overflow-x-auto">
          {filtered.length === 0 ? (
            <ListEmptyState
              icon={Monitor}
              title="Nenhum ativo encontrado"
              description="Ajuste os filtros ou importe uma planilha de inventário."
            />
          ) : (
          <Table className="min-w-[760px] table-fixed">
          <TableHeader><TableRow className="bg-muted/10"><TableHead className="w-[18%]">Nome do ativo</TableHead><TableHead className="w-[14%]">Tipo</TableHead><TableHead className="w-[14%]">Patrimônio</TableHead><TableHead className="w-[16%]">Usuário</TableHead><TableHead className="w-[16%]">Local</TableHead><TableHead className="w-[12%]">Agente</TableHead><TableHead className="w-[12%]">Status</TableHead><TableHead className="w-[14%]">Última comunicação</TableHead><TableHead className="w-9" /></TableRow></TableHeader>
          <TableBody>{pagedRows.map((row, index) => {
            if (row.kind === "network") {
              const device = row.device;
              const Icon = device.monitor_type === "PRINTER" ? Printer : device.monitor_type === "FIREWALL" ? ShieldCheck : Server;
              const rowStatus = device.status === "ALERTA" ? "ALERT" : device.status;
              return <TableRow key={row.key} data-state={selectedRow?.key === row.key ? "selected" : undefined} className={`h-[58px] cursor-pointer ${selectedRow?.key === row.key ? "border-l-2 border-l-primary bg-muted" : ""}`} onClick={() => setSelectedKey(row.key)}>
                <TableCell className="px-3"><div className="flex items-center gap-3"><div className={`grid size-7 shrink-0 place-items-center rounded-lg ${iconTones[index % iconTones.length]}`}><Icon className="size-4" /></div><span className="truncate text-xs font-semibold">{device.name}</span></div></TableCell>
                <TableCell className="truncate px-2 text-xs">{device.monitor_type === "PRINTER" ? "Impressora monitorada" : device.monitor_type === "FIREWALL" ? "Firewall" : "Servidor SMB"}</TableCell>
                <TableCell className="truncate px-2 text-xs">Monitoramento</TableCell>
                <TableCell className="truncate px-2 text-xs">{device.vendor || "--"}</TableCell>
                <TableCell className="truncate px-2 text-xs">{device.branch_name}</TableCell>
                <TableCell className="px-2"><Badge variant={networkStatusVariant(device.status)}>{device.status || "N/D"}</Badge></TableCell>
                <TableCell className="px-2"><Badge variant={rowStatus === "ALERT" || rowStatus === "OFFLINE" ? "warning" : "success"}>{networkHealthText(device)}</Badge></TableCell>
                <TableCell className="truncate px-2 text-[11px] text-muted-foreground">{timeAgo(device.last_seen_at)}</TableCell>
                <TableCell className="px-0"><Button variant="ghost" size="icon" className="size-8" onClick={(event) => { event.stopPropagation(); setSelectedKey(row.key); }}><MoreVertical /></Button></TableCell>
              </TableRow>;
            }
            const asset = row.asset;
            const hasAlert = asset.status === "ALERT" || asset.cpu_percent >= 85 || asset.memory_percent >= 85 || asset.disk_percent >= 85;
            const isInactive = asset.active === 0;
            return <TableRow key={row.key} data-state={selectedRow?.key === row.key ? "selected" : undefined} className={`h-[58px] cursor-pointer ${isInactive ? "opacity-50" : ""} ${selectedRow?.key === row.key ? "border-l-2 border-l-primary bg-muted" : ""}`} onClick={() => setSelectedKey(row.key)}>
              <TableCell className="px-3"><div className="flex items-center gap-3"><div className={`grid size-7 shrink-0 place-items-center rounded-lg ${iconTones[index % iconTones.length]}`}><AssetIcon asset={asset} /></div>{onOpenAsset ? <button type="button" onClick={(event) => { event.stopPropagation(); onOpenAsset(asset); }} className="truncate text-xs font-semibold hover:text-primary hover:underline">{asset.hostname}</button> : <span className="truncate text-xs font-semibold">{asset.hostname}</span>}{isInactive && <Badge variant="muted">Inativo</Badge>}</div></TableCell>
              <TableCell className="truncate px-2 text-xs">{asset.equipment_type || assetTypeLabel(asset.asset_type)}</TableCell>
              <TableCell className="truncate px-2 text-xs">{asset.patrimony_number || "Não informado"}</TableCell>
              <TableCell className="truncate px-2 text-xs">{asset.logged_user || "--"}</TableCell>
              <TableCell className="truncate px-2 text-xs">{asset.branch_name}</TableCell>
              <TableCell className="px-2"><div className="flex flex-col gap-0.5"><Badge variant={asset.status === "OFFLINE" ? "destructive" : "success"} className="w-fit">{asset.status === "OFFLINE" ? "Offline" : "Online"}</Badge>{asset.agent_version && <span className="text-[10px] text-muted-foreground">v{asset.agent_version}</span>}</div></TableCell>
              <TableCell className="px-2"><Badge variant={hasAlert ? "warning" : asset.status === "OFFLINE" ? "muted" : "success"}>{hasAlert ? "Alerta" : asset.status === "OFFLINE" ? "Sem agente" : "Normal"}</Badge></TableCell>
              <TableCell className="truncate px-2 text-[11px] text-muted-foreground">{timeAgo(asset.last_seen_at)}</TableCell>
              <TableCell className="px-0" onClick={(event) => event.stopPropagation()}><DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="size-8" aria-label={`Ações do ativo ${asset.hostname}`} />}><MoreVertical /></DropdownMenuTrigger><DropdownMenuContent align="end">{onOpenAsset && <DropdownMenuItem onClick={() => onOpenAsset(asset)}><ExternalLink /> Ver detalhes</DropdownMenuItem>}<DropdownMenuItem onClick={() => onNewTicket?.()}><MessageSquarePlus /> Abrir chamado</DropdownMenuItem>{asset.hostname && onRemoteAsset && <DropdownMenuItem onClick={() => onRemoteAsset(asset.id)}><Monitor /> Acesso remoto</DropdownMenuItem>}{permissions?.canConfigure && <DropdownMenuItem onClick={() => setToggleTarget(asset)}>{isInactive ? <><Power /> Reativar</> : <><PowerOff /> Desativar</>}</DropdownMenuItem>}{permissions?.canConfigure && <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(asset)}><Trash2 /> Excluir</DropdownMenuItem>}</DropdownMenuContent></DropdownMenu></TableCell>
            </TableRow>;
          })}</TableBody>
        </Table>
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
          onPageSizeChange={pagination.setPageSize}
          itemLabel="ativos"
          showPageSize
        />
        )}
      </Card>

      <div className="grid gap-4 lg:sticky lg:top-24">
        {selectedDevice ? (
          <NetworkDevicePanel device={selectedDevice} permissions={permissions} onCheckNow={checkNetworkNow} onOpenMonitoring={onOpenMonitoring || (() => {})} />
        ) : (
          <>
            {onOpenAsset && selected && <Button variant="outline" className="w-full" onClick={() => onOpenAsset(selected)}><ExternalLink /> Ver página do ativo</Button>}
            <AgentSummary asset={selected} inventory={inventory} permissions={permissions} onToggleActive={setToggleTarget} onDelete={setDeleteTarget} />
            {selected && <AssetMetricsChart assetId={selected.id} />}
            <InventoryPanel asset={selected} inventory={inventory} loading={inventoryLoading} />
          </>
        )}
      </div>
    </div>

    <Dialog open={Boolean(toggleTarget)} onOpenChange={(open) => !open && setToggleTarget(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{toggleTarget?.active === 0 ? "Reativar ativo" : "Desativar ativo"}</DialogTitle>
          <DialogDescription>
            {toggleTarget?.active === 0
              ? <>O ativo &quot;{toggleTarget?.hostname}&quot; voltará a aparecer como ativo no inventário.</>
              : <>O ativo &quot;{toggleTarget?.hostname}&quot; será marcado como inativo e ficará esmaecido no inventário. Você pode reativá-lo a qualquer momento.</>}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setToggleTarget(null)} disabled={actionPending}>Cancelar</Button>
          <Button onClick={confirmToggleActive} disabled={actionPending}>{actionPending ? "Salvando..." : toggleTarget?.active === 0 ? "Reativar" : "Desativar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir ativo</DialogTitle>
          <DialogDescription>
            Tem certeza que deseja excluir &quot;{deleteTarget?.hostname}&quot;? Esta ação não pode ser desfeita. Chamados e usuários vinculados serão desvinculados deste ativo.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={actionPending}>Cancelar</Button>
          <Button variant="destructive" onClick={confirmDeleteAsset} disabled={actionPending}>{actionPending ? "Excluindo..." : "Excluir definitivamente"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
