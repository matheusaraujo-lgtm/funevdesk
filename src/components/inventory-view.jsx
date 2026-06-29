"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, Boxes, Layers, Package, PackageMinus, Pencil, Plus, RefreshCcw, Search, Settings2, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { ListEmptyState } from "@/components/list-empty-state";
import { ImportTemplateButtons } from "@/components/import-template-buttons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useReloadableData } from "@/lib/use-reloadable-data";

const EMPTY_FORM = { name: "", sku: "", category: "", quantity: 0, minQuantity: 0, unit: "un", autoReorder: false, reorderTicketTypeId: "none" };
const EMPTY_MOVEMENT = { quantity: 1, movementType: "ENTRADA" };

function MetricCard({ icon: Icon, label, value, tone = "blue", active = false, onClick }) {
  const tones = {
    blue: "bg-primary/10 text-primary ring-primary/15",
    amber: "bg-amber-500/10 text-amber-600 ring-amber-500/15",
    green: "bg-secondary text-secondary-foreground ring-foreground/10",
    violet: "bg-muted text-muted-foreground ring-foreground/10",
  };
  const interactive = typeof onClick === "function";
  return (
    <Card
      className={`rounded-2xl border-0 shadow-none ring-1 transition ${active ? "ring-2 ring-primary" : "ring-foreground/10"}${interactive ? " cursor-pointer hover:-translate-y-0.5 hover:ring-primary/25" : ""}`}
      {...(interactive ? { role: "button", tabIndex: 0, onClick, onKeyDown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } } : {})}
    >
      <CardContent className="flex items-center gap-4 p-5">
        <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ring-1 ${tones[tone]}`}><Icon className="size-5" /></span>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 font-heading text-2xl font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function InventoryView({ branches = [], canConfigure = true, defaultBranchId = "" }) {
  const [items, setItems] = useState([]);
  const [branchId, setBranchId] = useState(() => defaultBranchId || "all");
  const [search, setSearch] = useState("");
  const [onlyLow, setOnlyLow] = useState(false);
  const [ticketTypes, setTicketTypes] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [configItem, setConfigItem] = useState(null);
  const [movementItem, setMovementItem] = useState(null);
  const [movement, setMovement] = useState(EMPTY_MOVEMENT);
  const [editItem, setEditItem] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { loading, reload: load } = useReloadableData(useCallback(async () => {
    const query = branchId !== "all" ? `?branchId=${encodeURIComponent(branchId)}` : "";
    const response = await fetch(`/api/inventory${query}`, { cache: "no-store" });
    if (response.ok) setItems((await response.json()).items);
  }, [branchId]));

  useEffect(() => {
    fetch("/api/catalog", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { catalog: [] }))
      .then((data) => setTicketTypes(data.catalog || []))
      .catch(() => setTicketTypes([]));
  }, []);

  const stats = useMemo(() => ({
    total: items.length,
    low: items.filter((item) => item.lowStock).length,
    auto: items.filter((item) => item.autoReorder).length,
    units: items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0),
  }), [items]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((item) => {
      if (onlyLow && !item.lowStock) return false;
      if (!term) return true;
      return `${item.name} ${item.sku || ""} ${item.category || ""}`.toLowerCase().includes(term);
    });
  }, [items, search, onlyLow]);

  async function createItem(event) {
    event.preventDefault();
    const response = await fetch("/api/inventory", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...form,
        branchId: branchId === "all" ? null : branchId,
        quantity: Number(form.quantity) || 0,
        minQuantity: Number(form.minQuantity) || 0,
        autoReorder: form.autoReorder,
        reorderTicketTypeId: form.reorderTicketTypeId !== "none" ? form.reorderTicketTypeId : null,
      }),
    });
    const result = await response.json();
    if (!response.ok) return toast.error(result.error || "Não foi possível cadastrar o item.");
    toast.success("Item cadastrado.");
    setForm(EMPTY_FORM);
    setCreateOpen(false);
    load();
  }

  async function saveConfig() {
    if (!configItem) return;
    const response = await fetch(`/api/inventory/${configItem.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        autoReorder: configItem.autoReorder,
        reorderTicketTypeId: configItem.reorderTicketTypeId && configItem.reorderTicketTypeId !== "none" ? configItem.reorderTicketTypeId : null,
        minQuantity: Number(configItem.min_quantity) || 0,
      }),
    });
    const result = await response.json();
    if (!response.ok) return toast.error(result.error || "Não foi possível salvar a configuração.");
    toast.success("Configuração de reposição salva.");
    setConfigItem(null);
    load();
  }

  function openMovement(item) {
    setMovement(EMPTY_MOVEMENT);
    setMovementItem(item);
  }

  async function submitMovement() {
    if (!movementItem) return;
    const quantity = Math.trunc(Number(movement.quantity));
    if (!Number.isFinite(quantity) || quantity <= 0) return toast.error("Informe uma quantidade maior que zero.");
    if (movement.movementType === "SAIDA" && quantity > movementItem.quantity) {
      return toast.error(`Saída maior que o saldo disponível (${movementItem.quantity}).`);
    }
    const response = await fetch(`/api/inventory/${movementItem.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        quantity,
        movementType: movement.movementType,
        notes: movement.movementType === "ENTRADA" ? "Entrada manual" : "Saída manual",
      }),
    });
    const result = await response.json();
    if (!response.ok) return toast.error(result.error || "Não foi possível registrar a movimentação.");
    toast.success(movement.movementType === "ENTRADA" ? "Entrada registrada." : "Saída registrada.");
    setMovementItem(null);
    load();
  }

  async function saveEdit() {
    if (!editItem) return;
    const name = (editItem.name || "").trim();
    if (name.length < 2) return toast.error("Nome deve ter ao menos 2 caracteres.");
    const response = await fetch(`/api/inventory/${editItem.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        sku: editItem.sku?.trim() || null,
        category: editItem.category?.trim() || null,
      }),
    });
    const result = await response.json();
    if (!response.ok) return toast.error(result.error || "Não foi possível atualizar o item.");
    toast.success("Item atualizado.");
    setEditItem(null);
    load();
  }

  async function deleteItem(item) {
    const response = await fetch(`/api/inventory/${item.id}`, { method: "DELETE" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return toast.error(result.error || "Não foi possível excluir o item.");
    toast.success("Item excluído.");
    load();
  }

  const branchLabel = branchId === "all" ? "todas as unidades" : branches.find((b) => b.id === branchId)?.name || "—";

  return (
    <div className="space-y-5 pb-6">
      {/* Header hero com ação primária */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/[0.07] via-card to-secondary/25 px-5 py-5 ring-1 ring-foreground/10 sm:px-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3.5">
            <span className="hidden size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm sm:flex"><Boxes className="size-5" /></span>
            <div>
              <h1 className="page-title text-[26px]">Estoque</h1>
              <p className="page-copy max-w-md">Materiais de TI e suprimentos consumidos nos atendimentos — com baixa automática ao resolver chamados.</p>
            </div>
          </div>
          {canConfigure && (
            <div className="flex flex-wrap items-center gap-2">
              <ImportTemplateButtons endpoint="/api/inventory" templateFile="modelo-estoque.csv" onImported={load} label="item" />
              <Button onClick={() => { setForm(EMPTY_FORM); setCreateOpen(true); }}><Plus /> Novo item</Button>
            </div>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Package} label="Itens cadastrados" value={stats.total} tone="blue" active={!onlyLow} onClick={() => setOnlyLow(false)} />
        <MetricCard icon={TriangleAlert} label="Em falta (abaixo do mínimo)" value={stats.low} tone="amber" active={onlyLow} onClick={() => setOnlyLow(true)} />
        <MetricCard icon={RefreshCcw} label="Reposição automática" value={stats.auto} tone="green" />
        <MetricCard icon={Layers} label="Unidades em estoque" value={stats.units} tone="violet" />
      </div>

      {/* Toolbar */}
      <Card className="rounded-2xl border-0 shadow-none ring-1 ring-foreground/10">
        <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome, SKU ou categoria..." className="h-9 pl-9" />
          </div>
          <div className="flex items-center gap-2">
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger aria-label="Filtrar por unidade" className="h-9 w-[200px] bg-card"><SelectValue placeholder="Unidade">{(v) => v === "all" ? "Todas as unidades" : branches.find((b) => b.id === v)?.name}</SelectValue></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as unidades</SelectItem>
                {branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <label className="flex h-9 cursor-pointer items-center gap-2 rounded-md border bg-card px-3 text-xs font-medium">
              <Checkbox checked={onlyLow} onCheckedChange={(v) => setOnlyLow(Boolean(v))} />
              Só em falta
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card className="gap-0 overflow-hidden rounded-2xl border-0 py-0 shadow-none ring-1 ring-foreground/10">
        {loading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">Carregando estoque...</div>
        ) : filtered.length === 0 ? (
          <ListEmptyState
            icon={Package}
            title={items.length === 0 ? "Nenhum item no estoque" : "Nenhum item encontrado"}
            description={items.length === 0 ? "Cadastre materiais e suprimentos para vinculá-los aos chamados." : "Ajuste a busca ou os filtros para localizar itens."}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/10">
                <TableHead>Item</TableHead>
                <TableHead className="w-[150px]">Categoria</TableHead>
                <TableHead className="w-[150px]">Unidade</TableHead>
                <TableHead className="w-[150px]">Saldo</TableHead>
                <TableHead className="w-[150px]">Reposição automática</TableHead>
                <TableHead className="w-[150px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((item) => (
                <TableRow key={item.id} data-low={item.lowStock || undefined} className="data-[low]:bg-amber-50/40">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${item.lowStock ? "bg-amber-500/10 text-amber-600" : "bg-primary/10 text-primary"}`}>
                        {item.lowStock ? <PackageMinus className="size-[18px]" /> : <Package className="size-[18px]" />}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{item.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{item.sku || item.branch_name || "Global"}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{item.category || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{item.branch_name || "Global"}</TableCell>
                  <TableCell>
                    <div className="flex items-baseline gap-1.5">
                      <span className={`text-lg font-bold tabular-nums ${item.lowStock ? "text-amber-600" : ""}`}>{item.quantity}</span>
                      <span className="text-[11px] text-muted-foreground">{item.unit || "un"}</span>
                      {item.lowStock && <Badge variant="warning" className="ml-1"><AlertTriangle className="size-3" /> Mín. {item.min_quantity}</Badge>}
                    </div>
                    {!item.lowStock && <p className="text-[11px] text-muted-foreground">mín. {item.min_quantity}</p>}
                  </TableCell>
                  <TableCell>
                    {item.autoReorder
                      ? <Badge variant="success"><RefreshCcw className="size-3" /> Ativa</Badge>
                      : <span className="text-xs text-muted-foreground">Desligada</span>}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1.5">
                      <Button size="sm" variant="outline" className="h-8" onClick={() => openMovement(item)}><ArrowDownCircle className="size-4" /> Movimentar</Button>
                      {canConfigure && (
                        <DropdownMenu>
                          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="size-8" aria-label={`Mais ações de ${item.name}`} />}><Settings2 className="size-4" /></DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setEditItem({ ...item })}><Pencil className="size-4" /> Editar item</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => setConfigItem({ ...item, reorderTicketTypeId: item.reorderTicketTypeId || "none" })}><RefreshCcw className="size-4" /> Reposição automática</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(item)}><Trash2 className="size-4" /> Excluir item</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Diálogo: novo item */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Novo item de estoque</DialogTitle></DialogHeader>
          <form className="grid gap-4" onSubmit={createItem}>
            <p className="rounded-lg border border-primary/15 bg-primary/[0.04] px-3 py-2 text-xs text-muted-foreground">
              {branchId === "all"
                ? "Será criado como item global, disponível para todas as unidades."
                : `Será vinculado à unidade: ${branchLabel}.`}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="inv-name">Nome</Label>
                <Input id="inv-name" value={form.name} onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))} placeholder="Ex.: Mouse USB" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-sku">SKU</Label>
                <Input id="inv-sku" value={form.sku} onChange={(e) => setForm((c) => ({ ...c, sku: e.target.value }))} placeholder="MOU-001" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-cat">Categoria</Label>
                <Input id="inv-cat" value={form.category} onChange={(e) => setForm((c) => ({ ...c, category: e.target.value }))} placeholder="Periféricos" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-qty">Quantidade inicial</Label>
                <Input id="inv-qty" type="number" min={0} value={form.quantity} onChange={(e) => setForm((c) => ({ ...c, quantity: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-min">Estoque mínimo</Label>
                <Input id="inv-min" type="number" min={0} value={form.minQuantity} onChange={(e) => setForm((c) => ({ ...c, minQuantity: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-unit">Unidade de medida</Label>
                <Input id="inv-unit" value={form.unit} onChange={(e) => setForm((c) => ({ ...c, unit: e.target.value }))} placeholder="un, cx, m..." />
              </div>
            </div>
            <div className="grid gap-2 rounded-lg border border-border/60 bg-muted/20 p-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <Checkbox checked={form.autoReorder} onCheckedChange={(v) => setForm((c) => ({ ...c, autoReorder: Boolean(v) }))} />
                Abrir chamado automaticamente ao atingir o mínimo
              </label>
              {form.autoReorder && (
                <Select value={form.reorderTicketTypeId} onValueChange={(v) => setForm((c) => ({ ...c, reorderTicketTypeId: v }))}>
                  <SelectTrigger className="h-9 bg-card" aria-label="Tipo de chamado de reposição"><SelectValue placeholder="Tipo de chamado de reposição">{(v) => v === "none" ? "Tipo padrão da organização" : ticketTypes.find((t) => t.id === v)?.name}</SelectValue></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Tipo padrão da organização</SelectItem>
                    {ticketTypes.map((type) => <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
              <Button type="submit"><Plus /> Cadastrar item</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Diálogo: editar item */}
      <Dialog open={Boolean(editItem)} onOpenChange={(open) => !open && setEditItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Editar item</DialogTitle></DialogHeader>
          {editItem && (
            <div className="grid gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="inv-edit-name">Nome</Label>
                <Input id="inv-edit-name" value={editItem.name || ""} onChange={(e) => setEditItem((c) => ({ ...c, name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-edit-sku">SKU</Label>
                <Input id="inv-edit-sku" value={editItem.sku || ""} onChange={(e) => setEditItem((c) => ({ ...c, sku: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-edit-cat">Categoria</Label>
                <Input id="inv-edit-cat" value={editItem.category || ""} onChange={(e) => setEditItem((c) => ({ ...c, category: e.target.value }))} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditItem(null)}>Cancelar</Button>
            <Button onClick={saveEdit}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo: reposição automática */}
      <Dialog open={Boolean(configItem)} onOpenChange={(open) => !open && setConfigItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Reposição automática · {configItem?.name}</DialogTitle></DialogHeader>
          {configItem && (
            <div className="grid gap-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <Checkbox checked={configItem.autoReorder} onCheckedChange={(v) => setConfigItem((c) => ({ ...c, autoReorder: Boolean(v) }))} />
                Abrir chamado quando o saldo atingir o mínimo
              </label>
              <div className="space-y-1.5">
                <Label htmlFor="inventory-config-min-quantity" className="text-xs">Estoque mínimo</Label>
                <Input id="inventory-config-min-quantity" type="number" min={0} value={configItem.min_quantity} onChange={(e) => setConfigItem((c) => ({ ...c, min_quantity: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inventory-config-reorder-type" className="text-xs">Tipo de chamado de reposição</Label>
                <Select value={configItem.reorderTicketTypeId || "none"} onValueChange={(v) => setConfigItem((c) => ({ ...c, reorderTicketTypeId: v }))}>
                  <SelectTrigger id="inventory-config-reorder-type" className="bg-card" aria-label="Tipo de chamado de reposição"><SelectValue>{(v) => !v || v === "none" ? "Tipo padrão da organização" : ticketTypes.find((t) => t.id === v)?.name}</SelectValue></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Tipo padrão da organização</SelectItem>
                    {ticketTypes.map((type) => <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfigItem(null)}>Cancelar</Button>
            <Button onClick={saveConfig}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo: movimentar */}
      <Dialog open={Boolean(movementItem)} onOpenChange={(open) => !open && setMovementItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Movimentar estoque · {movementItem?.name}</DialogTitle></DialogHeader>
          {movementItem && (
            <div className="grid gap-3">
              <div className="flex items-center justify-between rounded-lg border bg-muted/20 px-3 py-2 text-sm">
                <span className="text-muted-foreground">Saldo atual</span>
                <span className="font-semibold">{movementItem.quantity} {movementItem.unit || "un"}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant={movement.movementType === "ENTRADA" ? "default" : "outline"} className="h-10" onClick={() => setMovement((c) => ({ ...c, movementType: "ENTRADA" }))}>
                  <ArrowDownCircle className="size-4" /> Entrada
                </Button>
                <Button type="button" variant={movement.movementType === "SAIDA" ? "default" : "outline"} className="h-10" onClick={() => setMovement((c) => ({ ...c, movementType: "SAIDA" }))}>
                  <ArrowUpCircle className="size-4" /> Saída
                </Button>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inventory-movement-quantity" className="text-xs">Quantidade</Label>
                <Input id="inventory-movement-quantity" type="number" min={1} value={movement.quantity} onChange={(e) => setMovement((c) => ({ ...c, quantity: e.target.value }))} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMovementItem(null)}>Cancelar</Button>
            <Button onClick={submitMovement}>Registrar {movement.movementType === "ENTRADA" ? "entrada" : "saída"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(value) => !value && setDeleteTarget(null)}
        title="Excluir item de estoque"
        description={deleteTarget ? `Excluir "${deleteTarget.name}"? Itens com movimentações registradas não podem ser excluídos — nesse caso, desative o item.` : ""}
        onConfirm={() => { const target = deleteTarget; setDeleteTarget(null); if (target) deleteItem(target); }}
      />
    </div>
  );
}
