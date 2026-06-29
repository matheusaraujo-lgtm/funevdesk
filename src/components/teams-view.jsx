"use client";

import { useCallback, useMemo, useState } from "react";
import { MoreVertical, Pencil, Plus, Search, Trash2, Users, X } from "lucide-react";
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

function TeamSidePanel({ team, onClose, onEdit, onDelete, canConfigure }) {
  return <Card className="h-fit rounded-xl py-0 shadow-none lg:sticky lg:top-24">
    <div className="flex items-center justify-between gap-3 border-b p-5"><p className="font-heading font-bold">{team.name}</p><Button variant="ghost" size="icon" className="size-8" onClick={onClose} aria-label="Fechar painel"><X /></Button></div>
    <div className="space-y-4 p-5">
      <p className="text-sm text-muted-foreground">{team.description || "Sem descrição."}</p>
      <Separator />
      <div><p className="mb-2 text-xs font-semibold">Unidade</p><Badge variant="outline">{team.branch_name || "Todas"}</Badge></div>
      <div><p className="mb-2 text-xs font-semibold">Membros ({team.members?.length || 0})</p><div className="flex flex-wrap gap-1">{(team.members || []).map((m) => <Badge key={m.id} variant="muted">{m.name}</Badge>)}</div></div>
    </div>
    {canConfigure && <div className="grid gap-2 border-t p-5"><Button size="sm" variant="secondary" onClick={() => onEdit(team.id)}><Pencil /> Editar</Button><Button size="sm" variant="destructive" onClick={() => onDelete(team)}><Trash2 /> Excluir</Button></div>}
  </Card>;
}

export function TeamsView({ branchId = "", onNew, onEdit, canConfigure = false }) {
  const [teams, setTeams] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { loading, reload: load } = useReloadableData(useCallback(async () => {
    const params = branchId ? `?branchId=${branchId}` : "";
    const response = await fetch(`/api/teams${params}`, { cache: "no-store" });
    if (response.ok) setTeams((await response.json()).teams);
  }, [branchId]));

  const filtered = useMemo(() => teams.filter((team) => `${team.name} ${team.branch_name || ""} ${team.description || ""}`.toLowerCase().includes(search.toLowerCase())), [teams, search]);
  const selected = teams.find((team) => team.id === selectedId) || null;

  async function remove(team) {
    const response = await fetch(`/api/teams/${team.id}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) return toast.error(result.error || "Não foi possível excluir a equipe.");
    toast.success("Equipe excluída.");
    setDeleteTarget(null);
    if (selectedId === team.id) setSelectedId(null);
    setTeams(result.teams);
  }

  return <div className="space-y-5 pb-6">
    <PageHeader icon={Users} title="Equipes" description="Filas de atendimento e responsáveis por unidade." actions={canConfigure && <Button onClick={onNew}><Plus /> Nova equipe</Button>} />
    <div className={`grid items-start gap-4 ${selected ? "lg:grid-cols-[minmax(0,1fr)_320px]" : ""}`}>
      <Card className="overflow-hidden rounded-xl py-0 shadow-none">
        <div className="border-b p-4"><div className="relative max-w-md"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar equipe..." className="pl-9" /></div></div>
        {loading ? <ListLoadingSkeleton /> : filtered.length === 0 ? (
          <ListEmptyState
            icon={Users}
            title={search ? "Nenhuma equipe encontrada" : "Nenhuma equipe cadastrada"}
            description={search ? "Tente outro termo de busca." : "Crie equipes para organizar filas de atendimento."}
            actionLabel={canConfigure && !search ? "Nova equipe" : undefined}
            onAction={canConfigure && !search ? onNew : undefined}
          />
        ) : (
        <div className="overflow-x-auto"><Table><TableHeader><TableRow className="bg-muted/10"><TableHead>Equipe</TableHead><TableHead>Unidade</TableHead><TableHead>Membros</TableHead><TableHead className="w-12" /></TableRow></TableHeader><TableBody>{filtered.map((team) => <TableRow key={team.id} className={`cursor-pointer ${selectedId === team.id ? "border-l-2 border-l-primary bg-muted" : ""}`} onClick={() => setSelectedId(team.id)}><TableCell><div className="flex items-center gap-3"><div className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary"><Users className="size-4" /></div><div><p className="font-medium">{team.name}</p><p className="text-xs text-muted-foreground line-clamp-1">{team.description || "—"}</p></div></div></TableCell><TableCell>{team.branch_name || "Todas"}</TableCell><TableCell><Badge variant="muted">{team.members?.length || 0}</Badge></TableCell><TableCell onClick={(e) => e.stopPropagation()}>{canConfigure && <DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={`Ações de ${team.name}`} />}><MoreVertical /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => onEdit(team.id)}><Pencil /> Editar</DropdownMenuItem><DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(team)}><Trash2 /> Excluir</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}</TableCell></TableRow>)}</TableBody></Table></div>
        )}
      </Card>
      {selected && (
        <ResponsiveSidePanel open onOpenChange={(open) => !open && setSelectedId(null)}>
          <TeamSidePanel team={selected} onClose={() => setSelectedId(null)} onEdit={onEdit} onDelete={setDeleteTarget} canConfigure={canConfigure} />
        </ResponsiveSidePanel>
      )}
    </div>
    <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}><DialogContent><DialogHeader><DialogTitle>Excluir equipe</DialogTitle><DialogDescription>A exclusão só é permitida sem chamados vinculados.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button><Button variant="destructive" onClick={() => deleteTarget && remove(deleteTarget)}>Excluir</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
