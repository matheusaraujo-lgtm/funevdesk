"use client";

import { useMemo, useState } from "react";
import { Building2, MapPin, MoreVertical, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { ListEmptyState } from "@/components/list-empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const typeLabels = { MATRIZ: "Matriz", FILIAL: "Filial" };

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

function BranchSidePanel({ branch, onClose, onEdit, onDelete }) {
  return <Card className="h-fit gap-0 rounded-2xl border-0 py-0 shadow-none ring-1 ring-foreground/10 lg:sticky lg:top-24">
    <div className="flex items-center justify-between gap-3 border-b p-5"><p className="font-heading font-bold">{branch.name}</p><Button variant="ghost" size="icon" className="size-8" onClick={onClose} aria-label="Fechar painel"><X /></Button></div>
    <div className="space-y-4 p-5">
      <div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><Building2 className="size-5" /></div><div><Badge variant={branch.type === "MATRIZ" ? "secondary" : "outline"}>{typeLabels[branch.type]}</Badge><p className="mt-1 text-xs text-muted-foreground">{branch.code}</p></div></div>
      <Separator />
      <div><p className="mb-1 text-xs font-semibold">Localização</p><p className="text-sm text-muted-foreground">{branch.city ? `${branch.city}${branch.state ? ` · ${branch.state}` : ""}` : "Não informada"}</p></div>
      <div><p className="mb-2 text-xs font-semibold">Vínculos</p><div className="flex flex-wrap gap-1"><Badge variant="muted">{branch.user_count} usuários</Badge><Badge variant="muted">{branch.asset_count} ativos</Badge><Badge variant="muted">{branch.ticket_count} chamados</Badge></div></div>
    </div>
    <div className="grid gap-2 border-t p-5"><Button size="sm" variant="secondary" onClick={() => onEdit(branch.id)}><Pencil /> Editar</Button><Button size="sm" variant="destructive" onClick={() => onDelete(branch)}><Trash2 /> Excluir</Button></div>
  </Card>;
}

export function BranchesView({ branches, onNew, onEdit, onDelete }) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const filtered = useMemo(() => branches.filter((branch) => `${branch.name} ${branch.code} ${branch.city || ""} ${branch.state || ""}`.toLowerCase().includes(search.toLowerCase())), [branches, search]);
  const selected = branches.find((branch) => branch.id === selectedId) || null;

  return <div className="space-y-5 pb-6">
    {/* Header em destaque, no mesmo estilo do restante do app. */}
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/[0.07] via-card to-secondary/25 px-5 py-5 ring-1 ring-foreground/10 sm:px-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-start gap-3.5">
          <span className="hidden size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm sm:flex"><Building2 className="size-5" /></span>
          <div>
            <h1 className="page-title text-[26px]">Unidades</h1>
            <p className="page-copy max-w-md">Gerencie matriz e filiais da organização.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2"><Button onClick={onNew}><Plus /> Nova unidade</Button></div>
      </div>
    </div>
    <div className="grid gap-4 sm:grid-cols-3"><MetricCard icon={Building2} label="Total" value={branches.length} /><MetricCard icon={Building2} label="Matriz" value={branches.filter((branch) => branch.type === "MATRIZ").length} /><MetricCard icon={MapPin} label="Filiais" value={branches.filter((branch) => branch.type === "FILIAL").length} /></div>
    <div className={`grid items-start gap-4 ${selected ? "lg:grid-cols-[minmax(0,1fr)_320px]" : ""}`}>
      <Card className="overflow-hidden gap-0 rounded-2xl border-0 py-0 shadow-none ring-1 ring-foreground/10">
        <div className="border-b p-4"><div className="relative max-w-md"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar unidade..." className="pl-9" /></div></div>
        {filtered.length === 0 ? (
          <ListEmptyState
            icon={Building2}
            title={search ? "Nenhuma unidade encontrada" : "Nenhuma unidade cadastrada"}
            description={search ? "Tente outro termo de busca." : "Cadastre matriz e filiais da organização."}
            actionLabel={!search ? "Nova unidade" : undefined}
            onAction={!search ? onNew : undefined}
          />
        ) : (
        <div className="overflow-x-auto"><Table className="min-w-[720px]"><TableHeader><TableRow className="bg-muted/10"><TableHead>Unidade</TableHead><TableHead>Código</TableHead><TableHead>Tipo</TableHead><TableHead>Localização</TableHead><TableHead>Vínculos</TableHead><TableHead className="w-12" /></TableRow></TableHeader><TableBody>{filtered.map((branch) => <TableRow key={branch.id} data-state={selectedId === branch.id ? "selected" : undefined} className={`cursor-pointer ${selectedId === branch.id ? "border-l-2 border-l-primary bg-muted" : ""}`} onClick={() => setSelectedId(branch.id)}><TableCell><div className="flex items-center gap-3"><div className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary"><Building2 className="size-4" /></div><div><p className="font-medium">{branch.name}</p><p className="text-xs text-muted-foreground">Desde {new Date(branch.created_at).toLocaleDateString("pt-BR")}</p></div></div></TableCell><TableCell><Badge variant="outline">{branch.code}</Badge></TableCell><TableCell><Badge variant={branch.type === "MATRIZ" ? "secondary" : "outline"}>{typeLabels[branch.type]}</Badge></TableCell><TableCell>{branch.city ? `${branch.city}${branch.state ? ` · ${branch.state}` : ""}` : "Não informada"}</TableCell><TableCell><div className="flex flex-wrap gap-1"><Badge variant="muted">{branch.user_count} usuários</Badge><Badge variant="muted">{branch.asset_count} ativos</Badge></div></TableCell><TableCell onClick={(event) => event.stopPropagation()}><DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={`Ações de ${branch.name}`} />}><MoreVertical /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => onEdit(branch.id)}><Pencil /> Editar</DropdownMenuItem><DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(branch)}><Trash2 /> Excluir</DropdownMenuItem></DropdownMenuContent></DropdownMenu></TableCell></TableRow>)}</TableBody></Table></div>
        )}
      </Card>
      {selected && <BranchSidePanel branch={selected} onClose={() => setSelectedId(null)} onEdit={onEdit} onDelete={setDeleteTarget} />}
    </div>
    <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}><DialogContent><DialogHeader><DialogTitle>Excluir unidade</DialogTitle><DialogDescription>A exclusão só é permitida quando não houver registros vinculados.</DialogDescription></DialogHeader><p className="text-sm">Excluir <strong>{deleteTarget?.name}</strong>?</p><DialogFooter><Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button><Button variant="destructive" onClick={async () => { if (await onDelete(deleteTarget.id)) setDeleteTarget(null); }}><Trash2 /> Excluir definitivamente</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
