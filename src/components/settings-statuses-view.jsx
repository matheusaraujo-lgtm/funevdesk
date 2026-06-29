"use client";

import { useCallback, useMemo, useState } from "react";
import { Check, CircleSlash, Flag, ListChecks, MessageSquare, PauseCircle, Plus, Save, Tags, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useReloadableData } from "@/lib/use-reloadable-data";
import { ListEmptyState } from "@/components/list-empty-state";
import { ListLoadingSkeleton } from "@/components/list-loading-skeleton";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const EDITABLE = ["label", "is_terminal", "pauses_sla", "allows_messages"];

function snapshot(list) {
  return Object.fromEntries(list.map((s) => [s.id, EDITABLE.reduce((acc, key) => ({ ...acc, [key]: s[key] }), {})]));
}

function MetricCard({ icon: Icon, label, value, tone = "blue" }) {
  const tones = {
    blue: "bg-primary/10 text-primary ring-primary/15",
    gray: "bg-muted text-muted-foreground ring-foreground/10",
    amber: "bg-amber-500/10 text-amber-600 ring-amber-500/15",
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

const CORE_STATUS_CODES = ["ABERTO", "EM_ATENDIMENTO", "PENDENTE", "RESOLVIDO"];

export function SettingsStatusesView() {
  const [statuses, setStatuses] = useState([]);
  const [originals, setOriginals] = useState({});
  const [savingId, setSavingId] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newLabel, setNewLabel] = useState("");

  const apply = useCallback((list) => {
    setStatuses(list);
    setOriginals(snapshot(list));
  }, []);

  const { loading, reload: load } = useReloadableData(useCallback(async () => {
    const response = await fetch("/api/ticket-statuses", { cache: "no-store" });
    if (response.ok) apply((await response.json()).statuses || []);
  }, [apply]));

  const stats = useMemo(() => ({
    total: statuses.length,
    terminal: statuses.filter((s) => s.is_terminal).length,
    paused: statuses.filter((s) => s.pauses_sla).length,
  }), [statuses]);

  function isDirty(status) {
    const base = originals[status.id];
    if (!base) return false;
    return EDITABLE.some((key) => Boolean(status[key]) !== Boolean(base[key]) || (key === "label" && status[key] !== base[key]));
  }

  function patchRow(id, patch) {
    setStatuses((list) => list.map((s) => s.id === id ? { ...s, ...patch } : s));
  }

  async function createStatus() {
    const code = newCode.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "");
    const label = newLabel.trim();
    if (code.length < 2 || label.length < 2) return toast.error("Código e nome são obrigatórios.");
    const response = await fetch("/api/ticket-statuses", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, label }),
    });
    const result = await response.json();
    if (!response.ok) return toast.error(result.error || "Não foi possível criar.");
    apply(result.statuses);
    setNewCode("");
    setNewLabel("");
    setCreateOpen(false);
    toast.success("Situação criada.");
  }

  async function deleteStatus(status) {
    const response = await fetch(`/api/ticket-statuses/${status.id}`, { method: "DELETE" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return toast.error(result.error || "Não foi possível excluir a situação.");
    apply(result.statuses);
    toast.success("Situação excluída.");
  }

  async function saveStatus(status) {
    setSavingId(status.id);
    const response = await fetch(`/api/ticket-statuses/${status.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        label: status.label,
        isTerminal: status.is_terminal,
        pausesSla: status.pauses_sla,
        allowsMessages: status.allows_messages,
      }),
    });
    const result = await response.json();
    setSavingId("");
    if (!response.ok) return toast.error(result.error || "Não foi possível salvar.");
    apply(result.statuses);
    toast.success("Situação atualizada.");
  }

  return (
    <div className="space-y-5 pb-6">
      <PageHeader
        icon={Flag}
        title="Situações de chamado"
        description="Configure status, encerramento, pausa de SLA e mensagens permitidas."
        actions={<Button onClick={() => setCreateOpen(true)}><Plus /> Nova situação</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard icon={ListChecks} label="Situações configuradas" value={stats.total} tone="blue" />
        <MetricCard icon={CircleSlash} label="Encerram o chamado" value={stats.terminal} tone="gray" />
        <MetricCard icon={PauseCircle} label="Pausam o SLA" value={stats.paused} tone="amber" />
      </div>

      {/* Legenda dos comportamentos */}
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 rounded-2xl bg-card px-4 py-3 text-xs text-muted-foreground ring-1 ring-foreground/10">
        <span className="inline-flex items-center gap-1.5"><Flag className="size-3.5 text-primary" /> <strong className="font-medium text-foreground">Finaliza:</strong> encerra o chamado (status terminal).</span>
        <span className="inline-flex items-center gap-1.5"><PauseCircle className="size-3.5 text-amber-600" /> <strong className="font-medium text-foreground">Pausa SLA:</strong> congela o prazo (ex.: aguardando terceiros).</span>
        <span className="inline-flex items-center gap-1.5"><MessageSquare className="size-3.5 text-primary" /> <strong className="font-medium text-foreground">Mensagens:</strong> permite respostas neste status.</span>
      </div>

      <Card className="gap-0 overflow-hidden rounded-2xl border-0 py-0 shadow-none ring-1 ring-foreground/10">
        {loading ? <ListLoadingSkeleton /> : statuses.length === 0 ? (
          <ListEmptyState icon={Tags} title="Nenhuma situação" description="Adicione situações para o fluxo de chamados." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/10">
                <TableHead className="w-[160px]">Pré-visualização</TableHead>
                <TableHead className="w-[150px]">Código</TableHead>
                <TableHead>Nome exibido</TableHead>
                <TableHead className="w-[90px] text-center">Finaliza</TableHead>
                <TableHead className="w-[90px] text-center">Pausa SLA</TableHead>
                <TableHead className="w-[90px] text-center">Mensagens</TableHead>
                <TableHead className="w-[110px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {statuses.map((status) => {
                const dirty = isDirty(status);
                return (
                  <TableRow key={status.id} data-dirty={dirty || undefined} className="data-[dirty]:bg-primary/[0.03]">
                    <TableCell><StatusBadge value={status.code} statuses={statuses} /></TableCell>
                    <TableCell><code className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">{status.code}</code></TableCell>
                    <TableCell>
                      <Input
                        className="h-9"
                        aria-label={`Nome do status ${status.code}`}
                        value={status.label}
                        onChange={(e) => patchRow(status.id, { label: e.target.value })}
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <Checkbox aria-label={`Finaliza chamado (${status.code})`} checked={status.is_terminal} onCheckedChange={(v) => patchRow(status.id, { is_terminal: Boolean(v) })} />
                    </TableCell>
                    <TableCell className="text-center">
                      <Checkbox aria-label={`Pausa SLA (${status.code})`} checked={status.pauses_sla} onCheckedChange={(v) => patchRow(status.id, { pauses_sla: Boolean(v) })} />
                    </TableCell>
                    <TableCell className="text-center">
                      <Checkbox aria-label={`Permite mensagens (${status.code})`} checked={status.allows_messages} onCheckedChange={(v) => patchRow(status.id, { allows_messages: Boolean(v) })} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1.5">
                        {dirty ? (
                          <Button size="sm" className="h-8" disabled={savingId === status.id} onClick={() => saveStatus(status)}>
                            <Save className="size-3.5" /> {savingId === status.id ? "..." : "Salvar"}
                          </Button>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Check className="size-3.5 text-emerald-500" /> Salvo</span>
                        )}
                        {!CORE_STATUS_CODES.includes(status.code) && (
                          <Button size="icon" variant="ghost" className="size-8 text-muted-foreground hover:text-destructive" aria-label={`Excluir situação ${status.label}`} onClick={() => setDeleteTarget(status)}><Trash2 className="size-4" /></Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) { setNewCode(""); setNewLabel(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Nova situação</DialogTitle></DialogHeader>
          <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); createStatus(); }}>
            <div className="space-y-1.5">
              <Label htmlFor="status-code">Código</Label>
              <Input id="status-code" value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="Ex.: AGUARDANDO_TERCEIRO" />
              <p className="text-[11px] text-muted-foreground">Maiúsculas, números e underscore. Identificador interno do status.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="status-label">Nome exibido</Label>
              <Input id="status-label" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Ex.: Aguardando terceiro" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
              <Button type="submit"><Plus /> Criar situação</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(value) => !value && setDeleteTarget(null)}
        title="Excluir situação"
        description={deleteTarget ? `Excluir a situação "${deleteTarget.label}"? Só é permitido se nenhum chamado estiver usando-a.` : ""}
        onConfirm={() => { const target = deleteTarget; setDeleteTarget(null); if (target) deleteStatus(target); }}
      />
    </div>
  );
}
