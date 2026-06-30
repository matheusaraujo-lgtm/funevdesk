"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Check, Download, FileSpreadsheet, LoaderCircle, Monitor, Network, Package, Pencil, Search, Server, Ticket } from "lucide-react";
import { toast } from "sonner";
import { timeAgo } from "@/lib/utils";
import { useReloadableData } from "@/lib/use-reloadable-data";
import { AgentSummary, InventoryPanel } from "@/components/assets-view";
import { AssetMetricsChart } from "@/components/asset-metrics-chart";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const assetLabels = { NOTEBOOK: "Notebook", DESKTOP: "Desktop", SERVIDOR: "Servidor", IMPRESSORA: "Impressora", REDE: "Rede" };

function AssetGlyph({ type, className }) {
  const Icon = type === "SERVIDOR" ? Server : type === "REDE" ? Network : type === "IMPRESSORA" ? FileSpreadsheet : Monitor;
  return <Icon className={className} />;
}

const DEPLOY_STATUS = {
  PENDING: { label: "Na fila", variant: "secondary" },
  SENT: { label: "Instalando…", variant: "warning" },
  DONE: { label: "Concluído", variant: "success" },
  FAILED: { label: "Falhou", variant: "destructive" },
};

function SoftwareDeployCard({ asset }) {
  const [commands, setCommands] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [customId, setCustomId] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState([]); // [{ id, name, wingetId }]
  const [catalog, setCatalog] = useState([]);

  // Catálogo de software curado pelo admin em Configurações → Agente Windows.
  useEffect(() => {
    fetch("/api/software", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { packages: [] }))
      .then((data) => setCatalog(data.packages || []))
      .catch(() => setCatalog([]));
  }, []);

  const fetcher = useCallback(() => {
    return fetch(`/api/assets/${asset.id}/install`, { cache: "no-store" })
      .then((response) => response.json().then((result) => ({ ok: response.ok, result })))
      .then(({ ok, result }) => { if (ok) setCommands(result.commands || []); })
      .catch(() => { /* mantém a lista atual em caso de falha transitória */ });
  }, [asset.id]);
  const { reload } = useReloadableData(fetcher);

  // Enquanto houver comando em andamento, atualiza o status a cada 6s para o técnico ver o resultado.
  const hasInflight = commands.some((c) => c.status === "PENDING" || c.status === "SENT");
  useEffect(() => {
    if (!hasInflight) return undefined;
    const interval = setInterval(() => { reload(); }, 6000);
    return () => clearInterval(interval);
  }, [hasInflight, reload]);

  function toggle(app) {
    setSelected((prev) => (prev.some((a) => a.id === app.id) ? prev.filter((a) => a.id !== app.id) : [...prev, app]));
  }

  // Envia a lista escolhida (catálogo multi-seleção ou ID personalizado) em sequência.
  async function deployList(apps) {
    if (!apps.length) return;
    setSending(true);
    let okCount = 0;
    for (const app of apps) {
      try {
        const response = await fetch(`/api/assets/${asset.id}/install`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "INSTALL_APP", packageId: app.wingetId, name: app.name }),
        });
        if (response.ok) okCount += 1;
      } catch { /* falha em um app não interrompe os demais */ }
    }
    setSending(false);
    if (!okCount) return toast.error("Não foi possível enviar a instalação.");
    toast.success(okCount === 1 ? `${apps[0].name} enviado para instalação.` : `${okCount} aplicativos enviados para instalação.`);
    setSelected([]);
    setCustomId("");
    setQuery("");
    setDialogOpen(false);
    reload();
  }

  const filtered = catalog.filter((app) => app.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <Card className="gap-0 rounded-2xl border-0 py-0 shadow-none ring-1 ring-foreground/10">
      <div className="flex items-center justify-between gap-2 border-b p-5">
        <p className="flex items-center gap-2.5 font-heading text-sm font-bold">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Package className="size-[18px]" /></span>
          Distribuição de software
        </p>
        <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}><Download /> Instalar</Button>
      </div>
      <div className="p-2">
        {commands.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">Instale aplicativos remotamente neste equipamento, sem ir até a máquina.</p>
        ) : (
          commands.slice(0, 6).map((cmd) => {
            const meta = DEPLOY_STATUS[cmd.status] || DEPLOY_STATUS.PENDING;
            return (
              <div key={cmd.id} className="rounded-xl px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs font-medium">{cmd.command === "UNINSTALL_APP" ? "Remover " : ""}{cmd.label}</span>
                  <Badge variant={meta.variant}>{meta.label}</Badge>
                </div>
                {cmd.result && (cmd.status === "DONE" || cmd.status === "FAILED") && (
                  <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{cmd.result}</p>
                )}
                <p className="mt-0.5 text-[10px] text-muted-foreground">{cmd.createdByName} · {timeAgo(cmd.createdAt)}</p>
              </div>
            );
          })
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Instalar software em {asset.hostname}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-xs text-muted-foreground">Selecione um ou mais aplicativos. O agente instala em silêncio, com privilégios de administrador (serviço do sistema) — o usuário da máquina não precisa ser admin.</p>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar aplicativo..." className="pl-9" disabled={sending} />
            </div>
            <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
              {filtered.length === 0 ? (
                <p className="px-1 py-4 text-center text-xs text-muted-foreground">{catalog.length === 0 ? "Catálogo vazio. Cadastre aplicativos em Configurações → Agente Windows, ou use o ID winget abaixo." : "Nenhum app no catálogo com esse nome. Use o ID winget abaixo."}</p>
              ) : filtered.map((app) => {
                const isSel = selected.some((a) => a.id === app.id);
                return (
                  <button
                    key={app.id}
                    type="button"
                    disabled={sending}
                    onClick={() => toggle(app)}
                    className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-xs font-medium transition disabled:opacity-50 ${isSel ? "border-primary bg-primary/5" : "hover:border-primary/40 hover:bg-muted/50"}`}
                  >
                    <span className={`flex size-4 shrink-0 items-center justify-center rounded border ${isSel ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"}`}>{isSel && <Check className="size-3" />}</span>
                    <Package className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{app.name}</span>
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{app.wingetId}</span>
                  </button>
                );
              })}
            </div>
            <Button type="button" className="w-full" disabled={sending || selected.length === 0} onClick={() => deployList(selected)}>
              {sending ? <LoaderCircle className="animate-spin" /> : <Download />} Instalar selecionados{selected.length > 0 ? ` (${selected.length})` : ""}
            </Button>
            <div className="space-y-2 border-t pt-3">
              <Label htmlFor="custom-winget">ID winget personalizado</Label>
              <div className="flex gap-2">
                <Input id="custom-winget" value={customId} onChange={(event) => setCustomId(event.target.value)} placeholder="Ex.: Microsoft.PowerToys" disabled={sending} />
                <Button type="button" variant="outline" disabled={!customId.trim() || sending} onClick={() => deployList([{ id: customId.trim(), name: customId.trim(), wingetId: customId.trim() }])}>
                  {sending ? <LoaderCircle className="animate-spin" /> : <Search />}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">Para apps fora do catálogo, use o identificador exato do pacote (winget).</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export function AssetDetailView({ asset, tickets = [], permissions, onBack, onRemoteAsset, onOpenTicket, onReload }) {
  const [inventory, setInventory] = useState(null);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [editingPatrimony, setEditingPatrimony] = useState(false);
  const [patrimonyValue, setPatrimonyValue] = useState("");
  const [savingPatrimony, setSavingPatrimony] = useState(false);
  const canEdit = Boolean(permissions?.canManageTickets || permissions?.canConfigure);

  function openPatrimonyDialog() {
    setPatrimonyValue(asset?.patrimony_number || "");
    setEditingPatrimony(true);
  }

  async function savePatrimony(event) {
    event.preventDefault();
    setSavingPatrimony(true);
    const response = await fetch(`/api/assets/${asset.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ patrimonyNumber: patrimonyValue.trim() || null }),
    });
    const result = await response.json().catch(() => ({}));
    setSavingPatrimony(false);
    if (!response.ok) return toast.error(result.error || "Não foi possível salvar o patrimônio.");
    toast.success("Patrimônio atualizado.");
    setEditingPatrimony(false);
    onReload?.();
  }

  useEffect(() => {
    if (!asset?.id) return;
    let ignore = false;
    // Fetch com cancelamento (flag ignore) para evitar resposta defasada ao trocar de ativo.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInventoryLoading(true);
    fetch(`/api/assets/${asset.id}/inventory`, { cache: "no-store" })
      .then((response) => response.json().then((result) => ({ ok: response.ok, result })))
      .then(({ ok, result }) => { if (!ignore) { setInventory(ok ? result.inventory : null); setInventoryLoading(false); } })
      .catch(() => { if (!ignore) { setInventory(null); setInventoryLoading(false); } });
    return () => { ignore = true; };
  }, [asset?.id]);

  if (!asset) {
    return (
      <div className="ticket-shell flex min-h-[420px] items-center justify-center">
        <p className="text-sm text-muted-foreground">Ativo não encontrado.</p>
      </div>
    );
  }

  const assetTickets = tickets.filter((ticket) => ticket.asset_id === asset.id);
  const isInactive = asset.active === 0;

  return (
    <div className="space-y-5 pb-6">
      {/* Cabeçalho */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/[0.07] via-card to-secondary/25 px-5 py-5 ring-1 ring-foreground/10 sm:px-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3.5">
            <Button type="button" variant="outline" size="icon" className="mt-0.5 bg-card/70" onClick={onBack} aria-label="Voltar para ativos"><ArrowLeft /></Button>
            <span className="hidden size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm sm:flex"><AssetGlyph type={asset.asset_type} className="size-5" /></span>
            <div className="min-w-0">
              <h1 className="page-title text-[26px]">{asset.hostname}</h1>
              <p className="page-copy">{asset.equipment_type || assetLabels[asset.asset_type] || asset.asset_type} · {asset.branch_name} · atualizado {timeAgo(asset.last_seen_at)}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge variant={asset.status === "OFFLINE" ? "destructive" : "success"}>{asset.status === "OFFLINE" ? "Offline" : "Online"}</Badge>
                {isInactive && <Badge variant="muted">Inativo</Badge>}
                {asset.patrimony_number && <Badge variant="outline">Patrimônio {asset.patrimony_number}</Badge>}
                {canEdit && (
                  <button type="button" onClick={openPatrimonyDialog} className="inline-flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition hover:border-solid hover:text-foreground">
                    <Pencil className="size-3" /> {asset.patrimony_number ? "Editar patrimônio" : "Adicionar patrimônio"}
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {asset.hostname && onRemoteAsset && <Button variant="outline" onClick={() => onRemoteAsset(asset.id)}><Monitor /> Acesso remoto</Button>}
          </div>
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <AssetMetricsChart assetId={asset.id} />
          <InventoryPanel asset={asset} inventory={inventory} loading={inventoryLoading} />
        </div>

        <div className="grid gap-4 lg:sticky lg:top-24">
          <AgentSummary asset={asset} inventory={inventory} permissions={permissions} />

          {canEdit && <SoftwareDeployCard asset={asset} />}

          <Card className="gap-0 rounded-2xl border-0 py-0 shadow-none ring-1 ring-foreground/10">
            <div className="flex items-center justify-between gap-2 border-b p-5">
              <p className="flex items-center gap-2.5 font-heading text-sm font-bold"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Ticket className="size-[18px]" /></span>Chamados deste ativo</p>
              {assetTickets.length > 0 && <Badge variant="secondary">{assetTickets.length}</Badge>}
            </div>
            <div className="p-2">
              {assetTickets.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-muted-foreground">Nenhum chamado vinculado a este ativo.</p>
              ) : (
                assetTickets.slice(0, 8).map((ticket) => (
                  <button
                    key={ticket.id}
                    type="button"
                    onClick={() => onOpenTicket?.(ticket)}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-muted/50"
                  >
                    <span className="font-mono text-[11px] text-muted-foreground">#{ticket.number}</span>
                    <span className="min-w-0 flex-1 truncate text-xs font-medium">{ticket.title}</span>
                    <StatusBadge value={ticket.status} />
                  </button>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>

      <Dialog open={editingPatrimony} onOpenChange={setEditingPatrimony}>
        <DialogContent className="sm:max-w-sm">
          <form onSubmit={savePatrimony}>
            <DialogHeader>
              <DialogTitle>Patrimônio do ativo</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 py-3">
              <Label htmlFor="patrimony-input">Número de patrimônio</Label>
              <Input id="patrimony-input" value={patrimonyValue} onChange={(event) => setPatrimonyValue(event.target.value)} placeholder="Ex.: PAT-00123" maxLength={60} autoFocus />
              <p className="text-xs text-muted-foreground">Identificação do equipamento no inventário patrimonial. Deixe em branco para remover.</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingPatrimony(false)} disabled={savingPatrimony}>Cancelar</Button>
              <Button type="submit" disabled={savingPatrimony}>{savingPatrimony ? <LoaderCircle className="animate-spin" /> : null}Salvar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
