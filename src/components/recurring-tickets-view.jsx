"use client";

import { useCallback, useState } from "react";
import { Pencil, Plus, Repeat, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useReloadableData } from "@/lib/use-reloadable-data";
import { ListEmptyState } from "@/components/list-empty-state";
import { ListLoadingSkeleton } from "@/components/list-loading-skeleton";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const UNIT_LABELS = { DAYS: "dia(s)", WEEKS: "semana(s)", MONTHS: "mês(es)" };

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function RecurringTicketsView({ canConfigure = false, onNew, onEdit }) {
  const [templates, setTemplates] = useState([]);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { loading } = useReloadableData(useCallback(async () => {
    const response = await fetch("/api/recurring-tickets", { cache: "no-store" });
    if (response.ok) setTemplates((await response.json()).templates || []);
  }, []));

  async function toggleActive(template) {
    const response = await fetch(`/api/recurring-tickets/${template.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active: !template.active }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return toast.error(result.error || "Não foi possível atualizar.");
    setTemplates(result.templates || []);
  }

  async function remove(template) {
    const response = await fetch(`/api/recurring-tickets/${template.id}`, { method: "DELETE" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return toast.error(result.error || "Não foi possível excluir.");
    setTemplates(result.templates || []);
    toast.success("Modelo excluído.");
  }

  return (
    <div className="space-y-5 pb-6">
      <PageHeader
        icon={Repeat}
        title="Chamados recorrentes"
        description="Modelos que abrem chamados sozinhos no intervalo configurado — manutenções, checagens periódicas, etc."
        actions={canConfigure && <Button onClick={onNew}><Plus /> Novo modelo</Button>}
      />

      <Card className="overflow-hidden rounded-2xl border-0 py-0 shadow-none ring-1 ring-foreground/10">
        {loading ? <ListLoadingSkeleton /> : templates.length === 0 ? (
          <ListEmptyState
            icon={Repeat}
            title="Nenhum chamado recorrente configurado"
            description="Crie um modelo para o sistema abrir chamados automaticamente em um intervalo fixo."
            actionLabel={canConfigure ? "Novo modelo" : undefined}
            onAction={canConfigure ? onNew : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/10">
                  <TableHead>Modelo</TableHead>
                  <TableHead>Unidade</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Recorrência</TableHead>
                  <TableHead>Próxima execução</TableHead>
                  <TableHead className="text-center">Ativo</TableHead>
                  {canConfigure && <TableHead className="w-20" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((template) => (
                  <TableRow key={template.id}>
                    <TableCell>
                      <p className="font-medium">{template.title}</p>
                      {(template.assignee_name || template.team_name) && (
                        <p className="text-xs text-muted-foreground">{template.assignee_name || template.team_name}</p>
                      )}
                    </TableCell>
                    <TableCell>{template.branch_name}</TableCell>
                    <TableCell>{template.ticket_type_name || <span className="text-muted-foreground">Tipo removido</span>}</TableCell>
                    <TableCell>a cada {template.recurrence_interval} {UNIT_LABELS[template.recurrence_unit]}</TableCell>
                    <TableCell>
                      {template.active ? formatDate(template.next_run_at) : <Badge variant="secondary">Pausado</Badge>}
                    </TableCell>
                    <TableCell className="text-center">
                      <Checkbox checked={Boolean(template.active)} onCheckedChange={() => canConfigure && toggleActive(template)} disabled={!canConfigure} aria-label={`Ativar/pausar ${template.title}`} />
                    </TableCell>
                    {canConfigure && (
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button size="icon" variant="ghost" className="size-7 text-muted-foreground" title="Editar" onClick={() => onEdit(template)}>
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="size-7 text-muted-foreground hover:text-destructive" title="Excluir" onClick={() => setDeleteTarget(template)}>
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(value) => !value && setDeleteTarget(null)}
        title="Excluir chamado recorrente"
        description={deleteTarget ? `Excluir o modelo "${deleteTarget.title}"? Chamados já criados por ele não são afetados.` : ""}
        onConfirm={() => { const target = deleteTarget; setDeleteTarget(null); if (target) remove(target); }}
      />
    </div>
  );
}
