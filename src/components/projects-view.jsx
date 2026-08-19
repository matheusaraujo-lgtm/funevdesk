"use client";

import { useCallback, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FolderKanban, ListTodo, MoreVertical, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useReloadableData } from "@/lib/use-reloadable-data";
import { ListEmptyState } from "@/components/list-empty-state";
import { ListLoadingSkeleton } from "@/components/list-loading-skeleton";
import { ListPagination, useListPagination } from "@/components/list-pagination";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const statusLabels = { PLANEJAMENTO: "Planejamento", EM_ANDAMENTO: "Em andamento", PAUSADO: "Pausado", PENDENTE: "Pendente", CONCLUIDO: "Concluído", CANCELADO: "Cancelado" };
const statusVariants = { PLANEJAMENTO: "secondary", EM_ANDAMENTO: "warning", PAUSADO: "muted", PENDENTE: "destructive", CONCLUIDO: "success", CANCELADO: "destructive" };
const priorityLabels = { BAIXA: "Baixa", MEDIA: "Média", ALTA: "Alta", CRITICA: "Crítica" };
const statusPresets = [
  { id: "all", label: "Todos" },
  { id: "PLANEJAMENTO", label: "Planejamento" },
  { id: "EM_ANDAMENTO", label: "Em andamento" },
  { id: "PENDENTE", label: "Pendente" },
  { id: "PAUSADO", label: "Pausado" },
  { id: "CONCLUIDO", label: "Concluído" },
];

function MetricCard({ icon: Icon, label, value, tone = "blue" }) {
  const tones = {
    blue: "bg-primary/10 text-primary ring-primary/15",
    amber: "bg-amber-500/10 text-amber-600 ring-amber-500/15",
    green: "bg-secondary text-secondary-foreground ring-foreground/10",
    red: "bg-destructive/10 text-destructive ring-destructive/15",
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

export function ProjectsView({ branchId = "", onNew, onEdit, onOpen }) {
  const [projects, setProjects] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const { loading, reload: load } = useReloadableData(useCallback(async () => {
    const params = branchId ? `?branchId=${branchId}` : "";
    const response = await fetch(`/api/projects${params}`, { cache: "no-store" });
    if (response.ok) setProjects((await response.json()).projects);
  }, [branchId]));

  const filtered = useMemo(() => projects.filter((p) => {
    const term = search.toLowerCase();
    return (statusFilter === "all" || p.status === statusFilter)
      && `${p.number} ${p.name} ${p.owner_name || ""}`.toLowerCase().includes(term);
  }), [projects, search, statusFilter]);

  const pagination = useListPagination(filtered.length, 10);
  const paged = pagination.sliceItems(filtered);

  const activeCount = projects.filter((p) => p.status === "EM_ANDAMENTO").length;
  const doneCount = projects.filter((p) => p.status === "CONCLUIDO").length;
  const overdueCount = projects.filter((p) => p.due_date && p.due_date < new Date().toISOString() && p.status !== "CONCLUIDO" && p.status !== "CANCELADO").length;

  async function remove(project) {
    setDeleting(true);
    const response = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
    const result = await response.json();
    setDeleting(false);
    if (!response.ok) return toast.error(result.error || "Não foi possível excluir.");
    toast.success("Projeto excluído.");
    setDeleteTarget(null);
    load();
  }

  return (
    <div className="space-y-5 pb-6">
      <PageHeader
        icon={FolderKanban}
        title="Projetos"
        description="Organize e acompanhe a execução dos projetos da equipe."
        actions={<Button onClick={onNew}><Plus /> Novo projeto</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={FolderKanban} label="Projetos" value={projects.length} tone="blue" />
        <MetricCard icon={ListTodo} label="Em andamento" value={activeCount} tone="amber" />
        <MetricCard icon={CheckCircle2} label="Concluídos" value={doneCount} tone="green" />
        <MetricCard icon={AlertTriangle} label="Atrasados" value={overdueCount} tone="red" />
      </div>

      <div className="flex flex-wrap gap-2">
        {statusPresets.map((preset) => (
          <Button key={preset.id} variant={statusFilter === preset.id ? "default" : "outline"} size="sm" onClick={() => setStatusFilter(preset.id)}>
            {preset.label}
          </Button>
        ))}
      </div>

      <Card className="overflow-hidden rounded-2xl border-0 py-0 shadow-none ring-1 ring-foreground/10">
        <div className="border-b p-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar projeto..." className="pl-9" />
          </div>
        </div>
        {loading ? <ListLoadingSkeleton /> : filtered.length === 0 ? (
          <ListEmptyState
            icon={FolderKanban}
            title={search || statusFilter !== "all" ? "Nenhum projeto encontrado" : "Nenhum projeto criado"}
            description={search || statusFilter !== "all" ? "Ajuste os filtros ou a busca." : "Crie um projeto para organizar tarefas e acompanhar a execução."}
            actionLabel={!search && statusFilter === "all" ? "Novo projeto" : undefined}
            onAction={!search && statusFilter === "all" ? onNew : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/10">
                  <TableHead>Nº</TableHead>
                  <TableHead>Projeto</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Prioridade</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Progresso</TableHead>
                  <TableHead>Prazo</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((project) => {
                  const pct = project.task_count ? Math.round((project.done_count / project.task_count) * 100) : 0;
                  return (
                    <TableRow key={project.id} className="cursor-pointer" onClick={() => onOpen(project)}>
                      <TableCell className="font-semibold">#{project.number}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <FolderKanban className="size-4 shrink-0 text-primary" />
                          <span className="font-medium">{project.name}</span>
                        </div>
                      </TableCell>
                      <TableCell><Badge variant={statusVariants[project.status] || "secondary"} title={project.status === "PENDENTE" ? project.pending_reason : undefined}>{statusLabels[project.status] || project.status}</Badge></TableCell>
                      <TableCell>{priorityLabels[project.priority] || project.priority}</TableCell>
                      <TableCell>{project.owner_name || "—"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={pct} className="h-1.5 w-20" />
                          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{project.done_count}/{project.task_count}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{project.due_date ? new Date(project.due_date).toLocaleDateString("pt-BR") : "—"}</TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" />}><MoreVertical /></DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => onOpen(project)}><FolderKanban /> Abrir quadro</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onEdit(project)}><Pencil /> Editar</DropdownMenuItem>
                            <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(project)}><Trash2 /> Excluir</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
        {filtered.length > 0 && (
          <ListPagination
            totalItems={filtered.length}
            page={pagination.page}
            pageSize={pagination.pageSize}
            totalPages={pagination.totalPages}
            start={pagination.start}
            end={pagination.end}
            onPageChange={pagination.setPage}
            itemLabel="projetos"
          />
        )}
      </Card>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Excluir projeto"
        description={deleteTarget ? `Excluir "${deleteTarget.name}"? As tarefas do projeto também serão removidas. Esta ação não pode ser desfeita.` : ""}
        loading={deleting}
        onConfirm={() => deleteTarget && remove(deleteTarget)}
      />
    </div>
  );
}
