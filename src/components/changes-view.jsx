"use client";

import { useCallback, useMemo, useState } from "react";
import { CheckCircle2, Clock, GitBranchPlus, MoreVertical, Pencil, Plus, Search, Trash2, Wrench, X } from "lucide-react";
import { useReloadableData } from "@/lib/use-reloadable-data";
import { toast } from "sonner";
import { ListEmptyState } from "@/components/list-empty-state";
import { ListLoadingSkeleton } from "@/components/list-loading-skeleton";
import { PageHeader } from "@/components/page-header";
import { ResponsiveSidePanel } from "@/components/responsive-side-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const statusLabels = { all: "Todos", SOLICITADO: "Solicitado", ANALISE: "Análise", APROVADO: "Aprovado", IMPLEMENTANDO: "Implementando", CONCLUIDO: "Concluído", REJEITADO: "Rejeitado" };

// Workflow ITIL de mudança: transições válidas a partir de cada situação.
const CHANGE_TRANSITIONS = {
  SOLICITADO: [{ to: "ANALISE", label: "Enviar para análise" }],
  ANALISE: [{ to: "APROVADO", label: "Aprovar" }, { to: "REJEITADO", label: "Rejeitar", variant: "outline" }],
  APROVADO: [{ to: "IMPLEMENTANDO", label: "Iniciar implementação" }],
  IMPLEMENTANDO: [{ to: "CONCLUIDO", label: "Concluir" }],
};
const riskLabels = { BAIXO: "Baixo", MEDIO: "Médio", ALTO: "Alto" };
const statusPresets = [
  { id: "all", label: "Todos" },
  { id: "SOLICITADO", label: "Solicitados" },
  { id: "ANALISE", label: "Em análise" },
  { id: "APROVADO", label: "Aprovados" },
  { id: "IMPLEMENTANDO", label: "Em implementação" },
  { id: "CONCLUIDO", label: "Concluídos" },
  { id: "REJEITADO", label: "Rejeitados" },
];

function statusVariant(status) {
  if (status === "CONCLUIDO") return "success";
  if (status === "REJEITADO") return "destructive";
  return "secondary";
}

function ChangeSidePanel({ change, onClose, onEdit, onDelete, onTransition, transitioning }) {
  return (
    <Card className="h-fit overflow-hidden rounded-2xl border-0 py-0 shadow-none ring-1 ring-foreground/10 lg:sticky lg:top-24">
      <div className="border-b bg-muted/20 p-4">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Mudança</p>
            <p className="font-heading text-lg font-bold">#{change.number}</p>
          </div>
          <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={onClose} aria-label="Fechar painel"><X /></Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant={statusVariant(change.status)}>{statusLabels[change.status]}</Badge>
          <Badge variant={change.risk === "ALTO" ? "destructive" : change.risk === "MEDIO" ? "warning" : "muted"}>{riskLabels[change.risk]}</Badge>
          <Badge variant="outline">{change.change_type}</Badge>
        </div>
        <p className="mt-2 line-clamp-2 text-sm font-medium leading-snug">{change.title}</p>
      </div>
      <div className="space-y-4 p-4 text-sm">
        <section>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Responsável</p>
          <p>{change.assignee_name || "Não atribuído"}</p>
        </section>
        {change.description && (
          <>
            <Separator />
            <section>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Descrição</p>
              <p className="text-xs leading-5 text-muted-foreground">{change.description}</p>
            </section>
          </>
        )}
      </div>
      <div className="grid gap-2 border-t p-4">
        {(CHANGE_TRANSITIONS[change.status] || []).map((transition) => (
          <Button key={transition.to} size="sm" variant={transition.variant || "default"} disabled={transitioning} onClick={() => onTransition(change, transition.to)}>
            {transition.label}
          </Button>
        ))}
        <Button size="sm" variant="secondary" onClick={() => onEdit(change)}><Pencil /> Editar</Button>
        <Button size="sm" variant="destructive" onClick={() => onDelete(change)}><Trash2 /> Excluir</Button>
      </div>
    </Card>
  );
}

function MetricCard({ icon: Icon, label, value, tone = "blue" }) {
  const tones = {
    blue: "bg-primary/10 text-primary ring-primary/15",
    amber: "bg-amber-500/10 text-amber-600 ring-amber-500/15",
    green: "bg-secondary text-secondary-foreground ring-foreground/10",
    gray: "bg-muted text-muted-foreground ring-foreground/10",
  };
  return (
    <Card className="rounded-2xl border-0 shadow-none ring-1 ring-foreground/10">
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

export function ChangesView({ branchId = "", onNew, onEdit }) {
  const [changes, setChanges] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedId, setSelectedId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [transitioning, setTransitioning] = useState(false);

  const { loading, reload: load } = useReloadableData(useCallback(async () => {
    const params = branchId ? `?branchId=${branchId}` : "";
    const response = await fetch(`/api/changes${params}`, { cache: "no-store" });
    if (response.ok) setChanges((await response.json()).changes);
  }, [branchId]));

  const filtered = useMemo(() => changes.filter((c) => {
    const term = search.toLowerCase();
    return (statusFilter === "all" || c.status === statusFilter)
      && `${c.number} ${c.title} ${c.assignee_name || ""}`.toLowerCase().includes(term);
  }), [changes, search, statusFilter]);

  const selected = changes.find((c) => c.id === selectedId) || null;
  const pendingCount = changes.filter((c) => c.status === "SOLICITADO" || c.status === "ANALISE").length;
  const implementingCount = changes.filter((c) => c.status === "IMPLEMENTANDO").length;
  const concludedCount = changes.filter((c) => c.status === "CONCLUIDO").length;

  async function remove(change) {
    const response = await fetch(`/api/changes/${change.id}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) return toast.error(result.error || "Não foi possível excluir.");
    toast.success("Mudança excluída.");
    setDeleteTarget(null);
    if (selectedId === change.id) setSelectedId(null);
    load();
  }

  async function applyTransition(change, toStatus) {
    setTransitioning(true);
    const response = await fetch(`/api/changes/${change.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: toStatus }) });
    const result = await response.json().catch(() => ({}));
    setTransitioning(false);
    if (!response.ok) return toast.error(result.error || "Não foi possível atualizar a mudança.");
    toast.success(`Mudança movida para "${statusLabels[toStatus]}".`);
    load();
  }

  return (
    <div className="space-y-5 pb-6">
      <PageHeader
        icon={GitBranchPlus}
        title="Mudanças"
        description="Planeje, avalie o risco e aprove mudanças de TI antes de implementar."
        actions={<Button onClick={onNew}><Plus /> Nova mudança</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={GitBranchPlus} label="Mudanças registradas" value={changes.length} tone="blue" />
        <MetricCard icon={Clock} label="Pendentes" value={pendingCount} tone="amber" />
        <MetricCard icon={Wrench} label="Em implementação" value={implementingCount} tone="blue" />
        <MetricCard icon={CheckCircle2} label="Concluídas" value={concludedCount} tone="green" />
      </div>

      <div className="flex flex-wrap gap-2">
        {statusPresets.map((preset) => (
          <Button key={preset.id} variant={statusFilter === preset.id ? "default" : "outline"} size="sm" onClick={() => setStatusFilter(preset.id)}>
            {preset.label}
            {preset.id === "all" && pendingCount > 0 && <Badge variant="secondary" className="ml-1">{pendingCount}</Badge>}
          </Button>
        ))}
      </div>

      <div className={`grid items-start gap-4 ${selected ? "lg:grid-cols-[minmax(0,1fr)_320px]" : ""}`}>
        <Card className="overflow-hidden rounded-2xl border-0 py-0 shadow-none ring-1 ring-foreground/10">
          <div className="border-b p-4">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar mudança..." className="pl-9" />
            </div>
          </div>
          {loading ? <ListLoadingSkeleton /> : filtered.length === 0 ? (
            <ListEmptyState
              icon={GitBranchPlus}
              title={search || statusFilter !== "all" ? "Nenhuma mudança encontrada" : "Nenhuma mudança registrada"}
              description={search || statusFilter !== "all" ? "Ajuste os filtros ou a busca." : "Registre mudanças para controlar implementações e aprovações."}
              actionLabel={!search && statusFilter === "all" ? "Nova mudança" : undefined}
              onAction={!search && statusFilter === "all" ? onNew : undefined}
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/10">
                    <TableHead>ID</TableHead>
                    <TableHead>Título</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Risco</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Responsável</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((change) => (
                    <TableRow
                      key={change.id}
                      className={`cursor-pointer ${selectedId === change.id ? "border-l-2 border-l-primary bg-muted" : ""}`}
                      onClick={() => setSelectedId(change.id)}
                    >
                      <TableCell className="font-semibold">#{change.number}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <GitBranchPlus className="size-4 shrink-0 text-primary" />
                          <span className="font-medium">{change.title}</span>
                        </div>
                      </TableCell>
                      <TableCell><Badge variant="outline">{change.change_type}</Badge></TableCell>
                      <TableCell><Badge variant={change.risk === "ALTO" ? "destructive" : change.risk === "MEDIO" ? "warning" : "muted"}>{riskLabels[change.risk]}</Badge></TableCell>
                      <TableCell><Badge variant={statusVariant(change.status)}>{statusLabels[change.status]}</Badge></TableCell>
                      <TableCell>{change.assignee_name || "—"}</TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" />}><MoreVertical /></DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => onEdit(change)}><Pencil /> Editar</DropdownMenuItem>
                            <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(change)}><Trash2 /> Excluir</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
        {selected && (
          <ResponsiveSidePanel open onOpenChange={(open) => !open && setSelectedId(null)}>
            <ChangeSidePanel change={selected} onClose={() => setSelectedId(null)} onEdit={onEdit} onDelete={setDeleteTarget} onTransition={applyTransition} transitioning={transitioning} />
          </ResponsiveSidePanel>
        )}
      </div>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir mudança</DialogTitle>
            <DialogDescription>Esta ação não pode ser desfeita.</DialogDescription>
          </DialogHeader>
          <p className="text-sm">Excluir <strong>{deleteTarget?.title}</strong>?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => deleteTarget && remove(deleteTarget)}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
