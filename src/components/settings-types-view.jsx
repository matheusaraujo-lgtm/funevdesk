"use client";

import { useMemo, useState } from "react";
import { FileCheck2, FileText, MoreVertical, Pencil, Plus, Search, Ticket } from "lucide-react";
import { ListEmptyState } from "@/components/list-empty-state";
import { ImportTemplateButtons } from "@/components/import-template-buttons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function MetricCard({ label, value }) {
  return <Card className="rounded-2xl border-0 shadow-none ring-1 ring-foreground/10"><CardContent className="p-5"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p></CardContent></Card>;
}

function distributionBadges(type) {
  const badges = [];
  if (type.scopeMode === "SELECTED") {
    badges.push(<Badge key="scope" variant="outline">{type.branchNames?.length ? `${type.branchNames.length} unidade(s)` : "Por filial"}</Badge>);
  } else {
    badges.push(<Badge key="scope" variant="muted">Todas unidades</Badge>);
  }
  if (type.targetBranchMode === "MATRIZ") badges.push(<Badge key="route" variant="secondary">Fila matriz</Badge>);
  else if (type.targetBranchMode === "SPECIFIC") badges.push(<Badge key="route" variant="secondary">{type.targetBranchName || "Destino fixo"}</Badge>);
  return badges;
}

function workflowBadges(type) {
  const badges = [];
  if (type.requiresApproval) badges.push(<Badge key="apv" variant="warning">Aprovação {type.approvalMode === "FIXED" ? "fixa" : "selecionável"}</Badge>);
  if (type.requiresTerm) badges.push(<Badge key="term" variant="secondary"><FileCheck2 className="mr-1 size-3" />Termo</Badge>);
  return badges.length ? badges : <Badge variant="muted">Padrão</Badge>;
}

export function SettingsTypesView({ catalog, onToggleType, onNew, onEdit, onImported }) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => catalog.filter((type) => `${type.name} ${type.category} ${type.description}`.toLowerCase().includes(search.toLowerCase())), [catalog, search]);
  const activeCount = catalog.filter((type) => type.active).length;

  return <div className="space-y-5 pb-6">
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/[0.07] via-card to-secondary/25 px-5 py-5 ring-1 ring-foreground/10 sm:px-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-start gap-3.5">
          <span className="hidden size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm sm:flex"><Ticket className="size-5" /></span>
          <div>
            <h1 className="page-title text-[26px]">Tipos de chamado</h1>
            <p className="page-copy max-w-md">Formulários, filiais, roteamento, aprovação e termos por tipo de atendimento.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2"><ImportTemplateButtons endpoint="/api/catalog" templateFile="modelo-tipos-de-chamado.csv" onImported={onImported} label="tipo" /><Button onClick={onNew}><Plus /> Novo tipo</Button></div>
      </div>
    </div>
    <div className="grid gap-4 sm:grid-cols-4"><MetricCard label="Total" value={catalog.length} /><MetricCard label="Ativos" value={activeCount} /><MetricCard label="Com aprovação" value={catalog.filter((t) => t.requiresApproval).length} /><MetricCard label="Com termo" value={catalog.filter((t) => t.requiresTerm).length} /></div>
    <Card className="overflow-hidden rounded-2xl border-0 py-0 shadow-none ring-1 ring-foreground/10">
      <div className="border-b p-4"><div className="relative max-w-md"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar tipo..." /></div></div>
      {filtered.length === 0 ? (
        <ListEmptyState
          icon={FileText}
          title={search ? "Nenhum tipo encontrado" : "Nenhum tipo cadastrado"}
          description={search ? "Tente outro termo de busca." : "Cadastre tipos de chamado para personalizar formulários e fluxos."}
          actionLabel={!search ? "Novo tipo" : undefined}
          onAction={!search ? onNew : undefined}
        />
      ) : (
      <div className="overflow-x-auto"><Table className="min-w-[820px] table-fixed"><TableHeader><TableRow className="bg-muted/10"><TableHead className="w-[24%]">Nome</TableHead><TableHead className="w-[12%]">Categoria</TableHead><TableHead className="w-[8%]">Campos</TableHead><TableHead className="w-[16%]">Unidades</TableHead><TableHead className="w-[16%]">Fluxo</TableHead><TableHead className="w-[10%]">Status</TableHead><TableHead className="w-[14%]" /></TableRow></TableHeader><TableBody>{filtered.map((type) => <TableRow key={type.id}><TableCell><div className="flex items-center gap-3"><div className="grid size-9 place-items-center rounded-xl bg-accent text-accent-foreground"><FileText className="size-4" /></div><div className="min-w-0"><p className="truncate font-medium">{type.name}</p><p className="line-clamp-1 text-xs text-muted-foreground">{type.description}</p></div></div></TableCell><TableCell><Badge variant="outline">{type.category}</Badge></TableCell><TableCell>{type.fields.length}</TableCell><TableCell><div className="flex flex-wrap gap-1">{distributionBadges(type)}</div></TableCell><TableCell><div className="flex flex-wrap gap-1">{workflowBadges(type)}</div></TableCell><TableCell><Badge variant={type.active ? "success" : "muted"}>{type.active ? "Ativo" : "Inativo"}</Badge></TableCell><TableCell><div className="flex justify-end"><DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="size-8" aria-label={`Ações de ${type.name}`} />}><MoreVertical /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => onEdit(type)}><Pencil /> Editar</DropdownMenuItem><DropdownMenuItem onClick={() => onToggleType(type.id, !type.active)}>{type.active ? "Desativar" : "Ativar"}</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div></TableCell></TableRow>)}</TableBody></Table></div>
      )}
    </Card>
  </div>;
}
