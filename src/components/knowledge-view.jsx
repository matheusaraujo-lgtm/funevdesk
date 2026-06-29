"use client";

import { useCallback, useMemo, useState } from "react";
import { BookOpen, Eye, FileText, Globe, Layers, MoreVertical, Pencil, Plus, Search, Trash2 } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { plainTextPreview } from "@/lib/rich-text";
import { useReloadableData } from "@/lib/use-reloadable-data";

function MetricCard({ icon: Icon, label, value }) {
  return (
    <Card className="rounded-2xl border-0 shadow-none ring-1 ring-foreground/10">
      <CardContent className="flex items-center gap-3 p-5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-5" />
        </span>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold leading-tight">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ArticleCard({ article, onOpen, onEdit, onRemove, permissions }) {
  const scope = article.branch_name || "Global";
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Abrir artigo ${article.title}`}
      onClick={() => onOpen?.(article)}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen?.(article); } }}
      className="group flex cursor-pointer flex-col rounded-2xl bg-card p-5 text-left ring-1 ring-foreground/10 transition hover:-translate-y-0.5 hover:ring-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
          <FileText className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-heading text-[15px] font-semibold leading-snug">{article.title}</h3>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{plainTextPreview(article.content)}</p>
        </div>
        {(permissions.canManageTickets || permissions.canConfigure) && (
          <div onClick={(event) => event.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger aria-label="Ações do artigo" render={<Button variant="ghost" size="icon" className="-mr-1 -mt-1 size-8" />}>
                <MoreVertical />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onOpen?.(article)}><Eye /> Abrir</DropdownMenuItem>
                {permissions.canManageTickets && <DropdownMenuItem onClick={() => onEdit(article)}><Pencil /> Editar dados</DropdownMenuItem>}
                {permissions.canConfigure && <DropdownMenuItem variant="destructive" onClick={() => onRemove(article)}><Trash2 /> Excluir</DropdownMenuItem>}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {article.category && <Badge variant="outline">{article.category}</Badge>}
        <Badge variant="secondary" className={cn(!article.branch_name && "gap-1")}>
          {!article.branch_name && <Globe className="size-3" />}
          {scope}
        </Badge>
      </div>
    </div>
  );
}

export function KnowledgeView({ permissions, onNew, onEdit, onOpen }) {
  const [articles, setArticles] = useState([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { loading, reload: load } = useReloadableData(useCallback(async () => {
    const response = await fetch("/api/knowledge", { cache: "no-store" });
    if (response.ok) setArticles((await response.json()).articles);
  }, []));

  const categories = useMemo(() => Array.from(new Set(articles.map((article) => article.category).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR")), [articles]);
  const filtered = useMemo(() => articles.filter((article) => (category === "all" || article.category === category) && `${article.title} ${article.category} ${plainTextPreview(article.content, 500)}`.toLowerCase().includes(search.toLowerCase())), [articles, search, category]);

  async function remove(article) {
    const response = await fetch(`/api/knowledge/${article.id}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) return toast.error(result.error || "Não foi possível excluir o artigo.");
    toast.success("Artigo excluído.");
    load();
  }

  return <div className="space-y-5 pb-6">
    {/* Header em destaque, no mesmo estilo do restante do app. */}
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/[0.07] via-card to-secondary/25 px-5 py-5 ring-1 ring-foreground/10 sm:px-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-start gap-3.5">
          <span className="hidden size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm sm:flex"><BookOpen className="size-5" /></span>
          <div>
            <h1 className="page-title text-[26px]">{permissions?.canManageTickets ? "Base de conhecimento" : "Central de Ajuda"}</h1>
            <p className="page-copy max-w-md">Artigos para orientar usuários e resolver dúvidas sem precisar abrir chamado.</p>
          </div>
        </div>
        {permissions.canManageTickets && <Button onClick={onNew}><Plus /> Novo artigo</Button>}
      </div>
    </div>

    {/* Métricas só fazem sentido para quem gerencia a base. */}
    {permissions.canManageTickets && (
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard icon={FileText} label="Artigos" value={articles.length} />
        <MetricCard icon={Layers} label="Categorias" value={new Set(articles.map((article) => article.category)).size} />
        <MetricCard icon={Globe} label="Globais" value={articles.filter((article) => !article.branch_id).length} />
      </div>
    )}

    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative w-full sm:max-w-md">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="h-10 rounded-xl bg-card pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar artigo..." />
      </div>
      <Select value={category} onValueChange={setCategory}>
        <SelectTrigger className="h-10 w-full rounded-xl bg-card sm:w-56" aria-label="Filtrar por categoria">
          <SelectValue placeholder="Todas as categorias">{(current) => (current === "all" ? "Todas as categorias" : current)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas as categorias</SelectItem>
          {categories.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>

    {loading ? <ListLoadingSkeleton /> : filtered.length === 0 ? (
      <Card className="rounded-2xl border-0 shadow-none ring-1 ring-foreground/10">
        <ListEmptyState
          icon={BookOpen}
          title={(search || category !== "all") ? "Nenhum artigo encontrado" : "Nenhum artigo na base"}
          description={(search || category !== "all") ? "Tente outro termo de busca ou categoria." : "Crie artigos para orientar usuários e reduzir chamados repetidos."}
          actionLabel={permissions.canManageTickets && !search && category === "all" ? "Novo artigo" : undefined}
          onAction={permissions.canManageTickets && !search && category === "all" ? onNew : undefined}
        />
      </Card>
    ) : (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((article) => (
          <ArticleCard key={article.id} article={article} onOpen={onOpen} onEdit={onEdit} onRemove={setDeleteTarget} permissions={permissions} />
        ))}
      </div>
    )}
    <ConfirmDialog
      open={Boolean(deleteTarget)}
      onOpenChange={(value) => !value && setDeleteTarget(null)}
      title="Excluir artigo"
      description={deleteTarget ? `Excluir "${deleteTarget.title}"? A exclusão só é permitida se não houver registros vinculados.` : ""}
      onConfirm={() => { const target = deleteTarget; setDeleteTarget(null); if (target) remove(target); }}
    />
  </div>;
}
