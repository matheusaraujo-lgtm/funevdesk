"use client";

import { useCallback, useMemo, useState } from "react";
import { Building2, ExternalLink, Eye, FileCheck2, Monitor, MoreVertical, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useReloadableData } from "@/lib/use-reloadable-data";
import { ListEmptyState } from "@/components/list-empty-state";
import { ListLoadingSkeleton } from "@/components/list-loading-skeleton";
import { ListPagination, useListPagination } from "@/components/list-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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

export function TermsView({ permissions, branchId = "", onNew, onOpen }) {
  const [terms, setTerms] = useState([]);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [search, setSearch] = useState("");

  // O filtro de unidade é o seletor global (topo do app) — o servidor já devolve só os
  // termos da unidade escolhida, sem precisar de um segundo filtro local desconectado.
  const { loading, reload: load } = useReloadableData(useCallback(async () => {
    const params = branchId ? `?branchId=${branchId}` : "";
    const response = await fetch(`/api/terms${params}`, { cache: "no-store" });
    if (response.ok) setTerms((await response.json()).terms);
  }, [branchId]));

  const filtered = useMemo(() => terms.filter((term) => `${term.signer_name} ${term.hostname} ${term.branch_name}`.toLowerCase().includes(search.toLowerCase())), [terms, search]);
  const pagination = useListPagination(filtered.length, 10);
  const paged = pagination.sliceItems(filtered);

  async function remove(term) {
    const response = await fetch(`/api/terms/${term.id}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) return toast.error(result.error || "Não foi possível excluir o termo.");
    toast.success("Termo excluído.");
    load();
  }

  return <div className="space-y-5 pb-6">
    {/* Header em destaque, no mesmo estilo do restante do app. */}
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/[0.07] via-card to-secondary/25 px-5 py-5 ring-1 ring-foreground/10 sm:px-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-start gap-3.5">
          <span className="hidden size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm sm:flex"><FileCheck2 className="size-5" /></span>
          <div>
            <h1 className="page-title text-[26px]">Termos de equipamento</h1>
            <p className="page-copy max-w-md">Histórico de termos assinados e PDFs gerados.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2"><Button onClick={onNew}><Plus /> Novo termo</Button></div>
      </div>
    </div>
    <div className="grid gap-4 sm:grid-cols-3"><MetricCard icon={FileCheck2} label="Termos" value={terms.length} /><MetricCard icon={Building2} label="Unidades" value={new Set(terms.map((term) => term.branch_name)).size} /><MetricCard icon={Monitor} label="Equipamentos" value={new Set(terms.map((term) => term.hostname)).size} /></div>
    <Card className="overflow-hidden gap-0 rounded-2xl border-0 py-0 shadow-none ring-1 ring-foreground/10">
      <div className="border-b p-4"><div className="relative w-full max-w-md"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar termo..." /></div></div>
      {loading ? <ListLoadingSkeleton /> : filtered.length === 0 ? (
        <ListEmptyState
          icon={FileCheck2}
          title={search ? "Nenhum termo encontrado" : "Nenhum termo assinado"}
          description={search ? "Tente outro termo de busca." : "Registre termos de equipamento com assinatura digital."}
          actionLabel={!search ? "Novo termo" : undefined}
          onAction={!search ? onNew : undefined}
        />
      ) : (
        <div className="overflow-x-auto"><Table className="min-w-[760px]"><TableHeader><TableRow className="bg-muted/10"><TableHead>Assinante</TableHead><TableHead>Equipamento</TableHead><TableHead>Unidade</TableHead><TableHead>Data</TableHead><TableHead className="w-12" /></TableRow></TableHeader><TableBody>{paged.map((term) => <TableRow key={term.id} className="cursor-pointer" onClick={() => onOpen?.(term)}><TableCell><p className="font-medium">{term.signer_name}</p><p className="text-xs text-muted-foreground">{term.signer_document || "Sem documento"}</p></TableCell><TableCell>{term.hostname}</TableCell><TableCell>{term.branch_name}</TableCell><TableCell className="text-xs text-muted-foreground">{new Date(term.created_at).toLocaleString("pt-BR")}</TableCell><TableCell onClick={(event) => event.stopPropagation()}><DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon" />}><MoreVertical /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => onOpen?.(term)}><Eye /> Abrir</DropdownMenuItem><DropdownMenuItem asChild><a href={term.pdf_url} target="_blank" rel="noreferrer"><ExternalLink /> Abrir PDF</a></DropdownMenuItem>{permissions?.canConfigure && <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(term)}><Trash2 /> Excluir</DropdownMenuItem>}</DropdownMenuContent></DropdownMenu></TableCell></TableRow>)}</TableBody></Table></div>
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
          itemLabel="termos"
        />
      )}
    </Card>
    <ConfirmDialog
      open={Boolean(deleteTarget)}
      onOpenChange={(value) => !value && setDeleteTarget(null)}
      title="Excluir termo"
      description={deleteTarget ? `Excluir o termo de ${deleteTarget.signer_name}? A exclusão só é permitida se não houver registros vinculados.` : ""}
      onConfirm={() => { const target = deleteTarget; setDeleteTarget(null); if (target) remove(target); }}
    />
  </div>;
}
