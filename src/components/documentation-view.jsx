"use client";

import { useCallback, useMemo, useState } from "react";
import { BookText, ChevronDown, ChevronRight, Eye, FileText, FolderTree, Layers, List, MapPin, MoreVertical, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ListEmptyState } from "@/components/list-empty-state";
import { ListLoadingSkeleton } from "@/components/list-loading-skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { plainTextPreview } from "@/lib/rich-text";
import { useReloadableData } from "@/lib/use-reloadable-data";

function MetricCard({ icon: Icon, label, value }) {
  return <Card className="rounded-2xl border-0 shadow-none ring-1 ring-foreground/10"><CardContent className="flex items-center gap-3 p-5"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15"><Icon className="size-5" /></span><div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold leading-tight">{value}</p></div></CardContent></Card>;
}

function DocTable({ docs, onOpen, onEdit, onRemove, permissions, hideType = false }) {
  return (
    <div className="overflow-x-auto"><Table className="min-w-[760px]"><TableHeader><TableRow className="bg-muted/10"><TableHead>Título</TableHead>{!hideType && <TableHead>Tipo</TableHead>}<TableHead>Unidade</TableHead><TableHead className="w-12" /></TableRow></TableHeader><TableBody>{docs.map((doc) => <TableRow key={doc.id} className="cursor-pointer" onClick={() => onOpen?.(doc)}><TableCell><p className="font-medium">{doc.title}</p><p className="line-clamp-1 text-xs text-muted-foreground">{plainTextPreview(doc.content)}</p></TableCell>{!hideType && <TableCell><Badge variant="outline">{doc.document_type}</Badge></TableCell>}<TableCell><Badge variant="secondary">{doc.branch_name}</Badge></TableCell><TableCell onClick={(event) => event.stopPropagation()}><DropdownMenu><DropdownMenuTrigger aria-label="Ações do documento" render={<Button variant="ghost" size="icon" />}><MoreVertical /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => onOpen?.(doc)}><Eye /> Abrir</DropdownMenuItem>{permissions.canManageTickets && <DropdownMenuItem onClick={() => onEdit(doc)}><Pencil /> Editar dados</DropdownMenuItem>}{permissions.canConfigure && <DropdownMenuItem variant="destructive" onClick={() => onRemove(doc)}><Trash2 /> Excluir</DropdownMenuItem>}</DropdownMenuContent></DropdownMenu></TableCell></TableRow>)}</TableBody></Table></div>
  );
}

export function DocumentationView({ branches, branchId = "", permissions, onNew, onEdit, onOpen }) {
  const [documents, setDocuments] = useState([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [branchFilter, setBranchFilter] = useState("all");
  const [viewMode, setViewMode] = useState("tree");
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { loading, reload: load } = useReloadableData(useCallback(async () => {
    const response = await fetch("/api/documents", { cache: "no-store" });
    if (response.ok) setDocuments((await response.json()).documents);
  }, []));

  // Escopo pela unidade selecionada no topo (documentos globais sem unidade aparecem em todas).
  const scoped = useMemo(() => (branchId ? documents.filter((doc) => !doc.branch_id || doc.branch_id === branchId) : documents), [documents, branchId]);
  const types = useMemo(() => Array.from(new Set(scoped.map((doc) => doc.document_type).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR")), [scoped]);
  const branchOptions = useMemo(() => Array.from(new Set(scoped.map((doc) => doc.branch_name).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR")), [scoped]);
  const filtered = useMemo(() => scoped.filter((doc) => (typeFilter === "all" || doc.document_type === typeFilter) && (branchFilter === "all" || doc.branch_name === branchFilter) && `${doc.title} ${doc.document_type} ${doc.branch_name} ${plainTextPreview(doc.content, 6000)}`.toLowerCase().includes(search.toLowerCase())), [scoped, search, typeFilter, branchFilter]);
  // Hierarquia: agrupa por tipo de documento (a "árvore" do Notion/Confluence).
  const grouped = useMemo(() => {
    const map = new Map();
    for (const doc of filtered) {
      const key = doc.document_type || "Sem categoria";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(doc);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "pt-BR")).map(([type, docs]) => ({ type, docs }));
  }, [filtered]);
  const branchCount = new Set(scoped.map((doc) => doc.branch_id)).size;

  async function remove(doc) {
    const response = await fetch(`/api/documents/${doc.id}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) return toast.error(result.error || "Não foi possível excluir a documentação.");
    toast.success("Documentação excluída.");
    load();
  }

  return <div className="space-y-5 pb-6">
    {/* Header em destaque, no mesmo estilo do restante do app. */}
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/[0.07] via-card to-secondary/25 px-5 py-5 ring-1 ring-foreground/10 sm:px-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-start gap-3.5">
          <span className="hidden size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm sm:flex"><BookText className="size-5" /></span>
          <div>
            <h1 className="page-title text-[26px]">Documentação</h1>
            <p className="page-copy max-w-md">Informações técnicas separadas por unidade.</p>
          </div>
        </div>
        {permissions.canManageTickets && <Button onClick={onNew}><Plus /> Novo documento</Button>}
      </div>
    </div>
    <div className="grid gap-4 sm:grid-cols-3"><MetricCard icon={FileText} label="Documentos" value={scoped.length} /><MetricCard icon={MapPin} label="Unidades" value={branchCount} /><MetricCard icon={Layers} label="Tipos" value={new Set(scoped.map((doc) => doc.document_type)).size} /></div>
    <Card className="overflow-hidden rounded-2xl border-0 py-0 shadow-none ring-1 ring-foreground/10">
      <div className="border-b p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center"><div className="relative w-full max-w-md"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar documento..." /></div><Select value={typeFilter} onValueChange={setTypeFilter}><SelectTrigger className="w-full bg-card sm:w-48" aria-label="Filtrar por tipo"><SelectValue placeholder="Todos os tipos">{(current) => (current === "all" ? "Todos os tipos" : current)}</SelectValue></SelectTrigger><SelectContent><SelectItem value="all">Todos os tipos</SelectItem>{types.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent></Select><Select value={branchFilter} onValueChange={setBranchFilter}><SelectTrigger className="w-full bg-card sm:w-48" aria-label="Filtrar por unidade"><SelectValue placeholder="Todas as unidades">{(current) => (current === "all" ? "Todas as unidades" : current)}</SelectValue></SelectTrigger><SelectContent><SelectItem value="all">Todas as unidades</SelectItem>{branchOptions.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent></Select><div className="flex shrink-0 overflow-hidden rounded-lg border sm:ml-auto"><button type="button" aria-pressed={viewMode === "tree"} onClick={() => setViewMode("tree")} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium ${viewMode === "tree" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/50"}`}><FolderTree className="size-3.5" /> Árvore</button><button type="button" aria-pressed={viewMode === "list"} onClick={() => setViewMode("list")} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium ${viewMode === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/50"}`}><List className="size-3.5" /> Lista</button></div></div></div>
      {loading ? <ListLoadingSkeleton /> : filtered.length === 0 ? (
        <ListEmptyState
          icon={FileText}
          title={(search || typeFilter !== "all" || branchFilter !== "all") ? "Nenhum documento encontrado" : "Nenhum documento cadastrado"}
          description={(search || typeFilter !== "all" || branchFilter !== "all") ? "Tente outro termo de busca ou filtro." : "Cadastre documentação técnica por unidade."}
          actionLabel={permissions.canManageTickets && !search && typeFilter === "all" && branchFilter === "all" ? "Novo documento" : undefined}
          onAction={permissions.canManageTickets && !search && typeFilter === "all" && branchFilter === "all" ? onNew : undefined}
        />
      ) : viewMode === "list" ? (
        <DocTable docs={filtered} onOpen={onOpen} onEdit={onEdit} onRemove={setDeleteTarget} permissions={permissions} />
      ) : (
        <div className="divide-y">
          {grouped.map((group) => {
            const isCollapsed = collapsed.has(group.type) && !search;
            return (
              <div key={group.type}>
                <button type="button" onClick={() => setCollapsed((prev) => { const next = new Set(prev); if (next.has(group.type)) next.delete(group.type); else next.add(group.type); return next; })} className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-muted/30">
                  {isCollapsed ? <ChevronRight className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
                  <FolderTree className="size-4 text-primary" />
                  <span className="text-sm font-semibold">{group.type}</span>
                  <Badge variant="muted" className="ml-1">{group.docs.length}</Badge>
                </button>
                {!isCollapsed && <DocTable docs={group.docs} onOpen={onOpen} onEdit={onEdit} onRemove={setDeleteTarget} permissions={permissions} hideType />}
              </div>
            );
          })}
        </div>
      )}
    </Card>
    <ConfirmDialog
      open={Boolean(deleteTarget)}
      onOpenChange={(value) => !value && setDeleteTarget(null)}
      title="Excluir documento"
      description={deleteTarget ? `Excluir "${deleteTarget.title}"? A exclusão só é permitida se não houver registros vinculados.` : ""}
      onConfirm={() => { const target = deleteTarget; setDeleteTarget(null); if (target) remove(target); }}
    />
  </div>;
}
