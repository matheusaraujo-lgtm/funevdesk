"use client";

import { useCallback, useMemo, useState } from "react";
import { MoreVertical, Pencil, Plus, Search, Send, Trash2, Webhook } from "lucide-react";
import { toast } from "sonner";
import { useReloadableData } from "@/lib/use-reloadable-data";
import { ListEmptyState } from "@/components/list-empty-state";
import { ListLoadingSkeleton } from "@/components/list-loading-skeleton";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { eventLabel } from "@/components/webhook-events";

export function WebhooksView({ onNew, onEdit }) {
  const [webhooks, setWebhooks] = useState([]);
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { loading, reload: load } = useReloadableData(useCallback(async () => {
    const response = await fetch("/api/webhooks", { cache: "no-store" });
    if (response.ok) setWebhooks((await response.json()).webhooks);
  }, []));

  const filtered = useMemo(() => webhooks.filter((hook) => {
    const eventsText = (hook.events || []).map((e) => `${e} ${eventLabel(e)}`).join(" ");
    return `${hook.name} ${hook.url} ${eventsText}`.toLowerCase().includes(search.toLowerCase());
  }), [webhooks, search]);

  async function toggleActive(hook) {
    const response = await fetch(`/api/webhooks/${hook.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ active: !hook.active }) });
    const result = await response.json();
    if (!response.ok) return toast.error(result.error || "Não foi possível alterar.");
    setWebhooks(result.webhooks);
    toast.success(hook.active ? "Webhook desativado." : "Webhook ativado.");
  }

  async function remove(hook) {
    const response = await fetch(`/api/webhooks/${hook.id}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) return toast.error(result.error || "Não foi possível excluir.");
    setWebhooks(result.webhooks);
    toast.success("Webhook excluído.");
    setDeleteTarget(null);
  }

  async function testWebhook(hook) {
    const response = await fetch(`/api/webhooks/${hook.id}/test`, { method: "POST" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return toast.error(result.error || "Falha no teste do webhook.");
    toast.success(`Teste enviado com sucesso (HTTP ${result.status}).`);
  }

  return (
    <div className="space-y-5 pb-6">
      <PageHeader
        icon={Webhook}
        title="Webhooks"
        description="Integrações HTTP em tempo real para SIEM, Teams, Power Automate, Zabbix e Grafana."
        actions={<Button onClick={onNew}><Plus /> Novo webhook</Button>}
      />
      <Card className="overflow-hidden rounded-xl py-0 shadow-none">
        <div className="border-b p-4"><div className="relative max-w-md"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome, URL ou evento..." className="pl-9" /></div></div>
        {loading ? <ListLoadingSkeleton /> : filtered.length === 0 ? (
          <ListEmptyState
            icon={Webhook}
            title={search ? "Nenhum webhook encontrado" : "Nenhum webhook configurado"}
            description={search ? "Tente outro termo de busca." : "Configure webhooks para receber notificações de eventos do sistema."}
            actionLabel={search ? undefined : "Novo webhook"}
            onAction={search ? undefined : onNew}
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/10">
                  <TableHead>Nome</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead>Eventos</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((hook) => (
                  <TableRow key={hook.id}>
                    <TableCell><div className="flex items-center gap-2"><Webhook className="size-4 text-primary" /><span className="font-medium">{hook.name}</span></div></TableCell>
                    <TableCell className="max-w-xs truncate text-xs">{hook.url}</TableCell>
                    <TableCell><div className="flex flex-wrap gap-1">{(hook.events || []).map((e) => <Badge key={e} variant="muted" className="text-[10px]" title={e}>{eventLabel(e)}</Badge>)}</div></TableCell>
                    <TableCell><Badge variant={hook.active ? "success" : "muted"}>{hook.active ? "Ativo" : "Inativo"}</Badge></TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={`Ações de ${hook.name}`} />}><MoreVertical /></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onEdit(hook)}><Pencil /> Editar</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => testWebhook(hook)}><Send /> Testar disparo</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => toggleActive(hook)}>{hook.active ? "Desativar" : "Ativar"}</DropdownMenuItem>
                          <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(hook)}><Trash2 /> Excluir</DropdownMenuItem>
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

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir webhook</DialogTitle>
            <DialogDescription>Esta ação não pode ser desfeita.</DialogDescription>
          </DialogHeader>
          <p className="text-sm">Excluir <strong>{deleteTarget?.name}</strong>?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => deleteTarget && remove(deleteTarget)}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
