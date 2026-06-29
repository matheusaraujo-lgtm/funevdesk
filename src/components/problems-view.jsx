"use client";

import { useCallback, useMemo, useState } from "react";
import { Activity, AlertCircle, CheckCircle2, Link2, MoreVertical, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useReloadableData } from "@/lib/use-reloadable-data";
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

const statusLabels = { all: "Todos", ABERTO: "Aberto", ANALISE: "Em análise", CONHECIDO: "Erro conhecido", RESOLVIDO: "Resolvido" };
const statusPresets = [
  { id: "all", label: "Todos" },
  { id: "ABERTO", label: "Abertos" },
  { id: "ANALISE", label: "Em análise" },
  { id: "RESOLVIDO", label: "Resolvidos" },
];

function ProblemSidePanel({ problem, onClose, onEdit, onDelete, onManageLinks }) {
  return (
    <Card className="h-fit overflow-hidden rounded-2xl border-0 py-0 shadow-none ring-1 ring-foreground/10 lg:sticky lg:top-24">
      <div className="border-b bg-muted/20 p-4">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Problema</p>
            <p className="font-heading text-lg font-bold">#{problem.number}</p>
          </div>
          <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={onClose} aria-label="Fechar painel"><X /></Button>
        </div>
        <Badge variant={problem.status === "RESOLVIDO" ? "success" : "warning"}>{statusLabels[problem.status] || problem.status}</Badge>
        <p className="mt-2 line-clamp-2 text-sm font-medium leading-snug">{problem.title}</p>
      </div>
      <div className="space-y-4 p-4 text-sm">
        <section>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Responsável</p>
          <p>{problem.assignee_name || "Não atribuído"}</p>
        </section>
        <Separator />
        <section>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Incidentes vinculados</p>
          <div className="flex items-center justify-between gap-2">
            <Badge variant="muted">{problem.incident_count} chamado(s)</Badge>
            <Button size="sm" variant="outline" onClick={() => onManageLinks(problem)}><Link2 /> Gerenciar</Button>
          </div>
        </section>
        {problem.root_cause && (
          <>
            <Separator />
            <section>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Causa raiz</p>
              <p className="text-xs leading-5 text-muted-foreground">{problem.root_cause}</p>
            </section>
          </>
        )}
      </div>
      <div className="grid gap-2 border-t p-4">
        <Button size="sm" variant="secondary" onClick={() => onEdit(problem)}><Pencil /> Editar</Button>
        <Button size="sm" variant="destructive" onClick={() => onDelete(problem)}><Trash2 /> Excluir</Button>
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

function LinkIncidentsDialog({ problem, onClose, onChanged }) {
  const [incidents, setIncidents] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [search, setSearch] = useState("");

  const { loading, reload: refetch } = useReloadableData(useCallback(async () => {
    if (!problem) return;
    const response = await fetch(`/api/problems/${problem.id}`, { cache: "no-store" });
    if (response.ok) {
      const data = await response.json();
      setIncidents(data.incidents || []);
      setCandidates(data.candidates || []);
    }
  }, [problem]));

  async function setLink(ticket, problemId) {
    setBusyId(ticket.id);
    const response = await fetch(`/api/tickets/${ticket.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ problemId }),
    });
    setBusyId(null);
    if (!response.ok) return toast.error("Não foi possível atualizar o vínculo.");
    toast.success(problemId ? `Chamado #${ticket.number} vinculado.` : `Chamado #${ticket.number} desvinculado.`);
    await refetch();
    onChanged?.();
  }

  const term = search.trim().toLowerCase();
  const filteredCandidates = term
    ? candidates.filter((t) => `#${t.number} ${t.title} ${t.requester_name || ""}`.toLowerCase().includes(term))
    : candidates;

  return (
    <Dialog open={Boolean(problem)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Chamados do problema #{problem?.number}</DialogTitle>
          <DialogDescription>Vincule incidentes recorrentes a este problema para tratar a causa raiz.</DialogDescription>
        </DialogHeader>
        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Carregando…</p>
        ) : (
          <div className="space-y-5">
            <section>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Vinculados ({incidents.length})</p>
              {incidents.length === 0 ? (
                <p className="rounded-md border border-dashed bg-muted/20 px-3 py-4 text-center text-xs text-muted-foreground">Nenhum chamado vinculado ainda.</p>
              ) : (
                <div className="divide-y rounded-md border">
                  {incidents.map((t) => (
                    <div key={t.id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">#{t.number} · {t.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{t.requester_name || "—"} · {t.status}</p>
                      </div>
                      <Button size="sm" variant="ghost" disabled={busyId === t.id} onClick={() => setLink(t, null)}><X /> Remover</Button>
                    </div>
                  ))}
                </div>
              )}
            </section>
            <Separator />
            <section>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Adicionar chamado</p>
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar chamado aberto..." className="pl-9" />
              </div>
              {filteredCandidates.length === 0 ? (
                <p className="rounded-md border border-dashed bg-muted/20 px-3 py-4 text-center text-xs text-muted-foreground">Nenhum chamado disponível para vincular.</p>
              ) : (
                <div className="max-h-64 divide-y overflow-y-auto rounded-md border">
                  {filteredCandidates.map((t) => (
                    <div key={t.id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">#{t.number} · {t.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{t.requester_name || "—"} · {t.status}</p>
                      </div>
                      <Button size="sm" variant="outline" disabled={busyId === t.id} onClick={() => setLink(t, problem.id)}><Link2 /> Vincular</Button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ProblemsView({ branchId = "", onNew, onEdit }) {
  const [problems, setProblems] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedId, setSelectedId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [linkTarget, setLinkTarget] = useState(null);

  const { loading, reload: load } = useReloadableData(useCallback(async () => {
    const params = branchId ? `?branchId=${branchId}` : "";
    const response = await fetch(`/api/problems${params}`, { cache: "no-store" });
    if (response.ok) setProblems((await response.json()).problems);
  }, [branchId]));

  const filtered = useMemo(() => problems.filter((p) => {
    const term = search.toLowerCase();
    return (statusFilter === "all" || p.status === statusFilter)
      && `${p.number} ${p.title} ${p.assignee_name || ""}`.toLowerCase().includes(term);
  }), [problems, search, statusFilter]);

  const selected = problems.find((p) => p.id === selectedId) || null;
  const openCount = problems.filter((p) => p.status === "ABERTO" || p.status === "ANALISE").length;
  const resolvedCount = problems.filter((p) => p.status === "RESOLVIDO").length;
  const incidentTotal = problems.reduce((sum, p) => sum + (Number(p.incident_count) || 0), 0);

  async function remove(problem) {
    const response = await fetch(`/api/problems/${problem.id}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) return toast.error(result.error || "Não foi possível excluir.");
    toast.success("Problema excluído.");
    setDeleteTarget(null);
    if (selectedId === problem.id) setSelectedId(null);
    load();
  }

  return (
    <div className="space-y-5 pb-6">
      <PageHeader
        icon={AlertCircle}
        title="Problemas"
        description="Agrupe incidentes recorrentes e registre a causa raiz."
        actions={<Button onClick={onNew}><Plus /> Novo problema</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={AlertCircle} label="Problemas registrados" value={problems.length} tone="blue" />
        <MetricCard icon={Activity} label="Em aberto" value={openCount} tone="amber" />
        <MetricCard icon={CheckCircle2} label="Resolvidos" value={resolvedCount} tone="green" />
        <MetricCard icon={Link2} label="Incidentes vinculados" value={incidentTotal} tone="gray" />
      </div>

      <div className="flex flex-wrap gap-2">
        {statusPresets.map((preset) => (
          <Button key={preset.id} variant={statusFilter === preset.id ? "default" : "outline"} size="sm" onClick={() => setStatusFilter(preset.id)}>
            {preset.label}
            {preset.id === "all" && openCount > 0 && <Badge variant="secondary" className="ml-1">{openCount}</Badge>}
          </Button>
        ))}
      </div>

      <div className={`grid items-start gap-4 ${selected ? "lg:grid-cols-[minmax(0,1fr)_320px]" : ""}`}>
        <Card className="overflow-hidden rounded-2xl border-0 py-0 shadow-none ring-1 ring-foreground/10">
          <div className="border-b p-4">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar problema..." className="pl-9" />
            </div>
          </div>
          {loading ? <ListLoadingSkeleton /> : filtered.length === 0 ? (
            <ListEmptyState
              icon={AlertCircle}
              title={search || statusFilter !== "all" ? "Nenhum problema encontrado" : "Nenhum problema registrado"}
              description={search || statusFilter !== "all" ? "Ajuste os filtros ou a busca." : "Registre problemas para rastrear causa raiz e incidentes recorrentes."}
              actionLabel={!search && statusFilter === "all" ? "Novo problema" : undefined}
              onAction={!search && statusFilter === "all" ? onNew : undefined}
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/10">
                    <TableHead>ID</TableHead>
                    <TableHead>Título</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Responsável</TableHead>
                    <TableHead>Incidentes</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((problem) => (
                    <TableRow
                      key={problem.id}
                      className={`cursor-pointer ${selectedId === problem.id ? "border-l-2 border-l-primary bg-muted" : ""}`}
                      onClick={() => setSelectedId(problem.id)}
                    >
                      <TableCell className="font-semibold">#{problem.number}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <AlertCircle className="size-4 shrink-0 text-destructive" />
                          <span className="font-medium">{problem.title}</span>
                        </div>
                      </TableCell>
                      <TableCell><Badge variant={problem.status === "RESOLVIDO" ? "success" : "warning"}>{statusLabels[problem.status] || problem.status}</Badge></TableCell>
                      <TableCell>{problem.assignee_name || "—"}</TableCell>
                      <TableCell><Badge variant="muted">{problem.incident_count}</Badge></TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" />}><MoreVertical /></DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => onEdit(problem)}><Pencil /> Editar</DropdownMenuItem>
                            <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(problem)}><Trash2 /> Excluir</DropdownMenuItem>
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
            <ProblemSidePanel problem={selected} onClose={() => setSelectedId(null)} onEdit={onEdit} onDelete={setDeleteTarget} onManageLinks={setLinkTarget} />
          </ResponsiveSidePanel>
        )}
      </div>

      {linkTarget && (
        <LinkIncidentsDialog problem={linkTarget} onClose={() => setLinkTarget(null)} onChanged={load} />
      )}

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir problema</DialogTitle>
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
