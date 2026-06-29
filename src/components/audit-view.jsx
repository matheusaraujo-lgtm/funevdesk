"use client";

import { useCallback, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ClipboardList, Download, Search } from "lucide-react";
import { toast } from "sonner";
import { useReloadableData } from "@/lib/use-reloadable-data";
import { ListEmptyState } from "@/components/list-empty-state";
import { ListLoadingSkeleton } from "@/components/list-loading-skeleton";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const PAGE_SIZE = 50;

const actionLabels = {
  CREATE: "Criou", UPDATE: "Atualizou", DELETE: "Excluiu",
  REMOTE_REQUESTED: "Acesso remoto", PASSWORD_RESET_REQUEST: "Reset de senha", WORKLOG: "Atendimento",
};
const entityLabels = {
  ASSET: "Ativo", PROFILE: "Perfil", TICKET: "Chamado", ticket: "Chamado", USER: "Usuário",
  automation_rule: "Automação", change: "Mudança", problem: "Problema",
};
const detailKeyLabels = { status: "Situação", assume: "Assumiu", assigneeId: "Responsável", priority: "Prioridade" };

function actionText(action) { return actionLabels[action] || action; }
function entityText(entity) { return entityLabels[entity] || entity; }

// Converte o JSON técnico de detalhes em texto legível ("Situação: Em atendimento").
function formatDetails(details) {
  if (!details) return "—";
  let value = details;
  try {
    value = JSON.parse(details);
    if (typeof value === "string") value = JSON.parse(value);
  } catch { return details; }
  if (value && typeof value === "object") {
    const parts = Object.entries(value)
      .filter(([, v]) => v !== null && v !== undefined && v !== "")
      .map(([key, v]) => `${detailKeyLabels[key] || key}: ${v}`);
    return parts.length ? parts.join(" · ") : "—";
  }
  return String(value);
}

export function AuditView({ branchId = "", branches = [] }) {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState(false);

  const { loading } = useReloadableData(useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (branchId) params.set("branchId", branchId);
    const response = await fetch(`/api/audit?${params}`, { cache: "no-store" });
    if (response.ok) {
      const data = await response.json();
      setLogs(data.logs);
      setTotal(data.total || 0);
    }
  }, [branchId, page]));

  const branchMap = useMemo(() => Object.fromEntries(branches.map((branch) => [branch.id, branch.name])), [branches]);
  // A busca filtra a página atual; a navegação entre páginas é feita no servidor.
  const filtered = useMemo(() => logs.filter((log) => `${log.actor_name} ${log.entity_type} ${log.action} ${log.details || ""} ${branchMap[log.branch_id] || ""}`.toLowerCase().includes(search.toLowerCase())), [logs, search, branchMap]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  async function exportCsv() {
    setExporting(true);
    try {
      const rows = [];
      const pages = Math.max(1, Math.ceil(total / 200));
      for (let p = 1; p <= pages; p += 1) {
        const params = new URLSearchParams({ page: String(p), limit: "200" });
        if (branchId) params.set("branchId", branchId);
        const response = await fetch(`/api/audit?${params}`, { cache: "no-store" });
        if (!response.ok) break;
        rows.push(...(await response.json()).logs);
      }
      const header = ["Data", "Usuário", "Unidade", "Entidade", "Ação", "Detalhes"];
      const csv = [header, ...rows.map((log) => [
        new Date(log.created_at).toLocaleString("pt-BR"),
        log.actor_name || "",
        log.branch_id ? (branchMap[log.branch_id] || "Unidade") : "Global",
        entityText(log.entity_type || ""),
        actionText(log.action || ""),
        formatDetails(log.details).replace(/[\r\n]+/g, " "),
      ])].map((cols) => cols.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\n");
      const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `auditoria-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(`${rows.length} registro(s) exportado(s).`);
    } catch {
      toast.error("Não foi possível exportar a auditoria.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-5 pb-6">
      <PageHeader
        icon={ClipboardList}
        title="Auditoria"
        description={branchId ? `Histórico de ações na unidade ${branchMap[branchId] || "selecionada"}.` : "Histórico completo de ações realizadas no sistema."}
      />
      <Card className="overflow-hidden rounded-xl py-0 shadow-none">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filtrar nesta página..." className="pl-9" />
          </div>
          <Button variant="outline" size="sm" className="h-9 shrink-0 sm:ml-auto" onClick={exportCsv} disabled={exporting || total === 0}>
            <Download className="size-4" /> {exporting ? "Exportando..." : "Exportar CSV"}
          </Button>
        </div>
        {loading ? <ListLoadingSkeleton /> : filtered.length === 0 ? (
          <ListEmptyState
            icon={ClipboardList}
            title={search ? "Nenhum registro nesta página" : "Nenhum registro de auditoria"}
            description={search ? "Tente outro termo ou mude de página." : "As ações realizadas no sistema aparecerão aqui."}
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/10">
                  <TableHead>Data</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Unidade</TableHead>
                  <TableHead>Entidade</TableHead>
                  <TableHead>Ação</TableHead>
                  <TableHead>Detalhes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap text-xs">{new Date(log.created_at).toLocaleString("pt-BR")}</TableCell>
                    <TableCell><div className="flex items-center gap-2"><ClipboardList className="size-4 text-muted-foreground" />{log.actor_name}</div></TableCell>
                    <TableCell className="text-xs">{log.branch_id ? branchMap[log.branch_id] || "Unidade" : "Global"}</TableCell>
                    <TableCell><Badge variant="outline">{entityText(log.entity_type)}</Badge></TableCell>
                    <TableCell><Badge variant="secondary">{actionText(log.action)}</Badge></TableCell>
                    <TableCell className="max-w-xs truncate text-xs text-muted-foreground" title={formatDetails(log.details)}>{formatDetails(log.details)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {total > 0 && (
          <div className="flex flex-col gap-2 border-t px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center">
            <span>Página {page} de {totalPages} · {total} registro(s)</span>
            <div className="flex gap-1 sm:ml-auto">
              <Button variant="outline" size="sm" className="h-8" disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))}>
                <ChevronLeft className="size-4" /> Anterior
              </Button>
              <Button variant="outline" size="sm" className="h-8" disabled={page >= totalPages || loading} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>
                Próxima <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
