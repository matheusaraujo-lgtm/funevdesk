"use client";

import { useCallback, useState } from "react";
import { MessageSquareText, Pencil, Plus, Tags, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useReloadableData } from "@/lib/use-reloadable-data";
import { ListEmptyState } from "@/components/list-empty-state";
import { ListLoadingSkeleton } from "@/components/list-loading-skeleton";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

function emptyForm() {
  return { id: null, title: "", body: "" };
}

// Biblioteca única da organização (mesma tabela usada em "Resolver chamado" — endpoint
// /api/macros): qualquer técnico pode inserir uma resposta pronta; só quem tem permissão
// em "canned_responses" gerencia (cria/edita/apaga) aqui.
export function SettingsCannedResponsesView() {
  const [macros, setMacros] = useState([]);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { loading } = useReloadableData(useCallback(async () => {
    const response = await fetch("/api/macros", { cache: "no-store" });
    if (response.ok) setMacros((await response.json()).macros || []);
  }, []));

  function openCreate() {
    setForm(emptyForm());
    setFormOpen(true);
  }

  function openEdit(macro) {
    setForm({ id: macro.id, title: macro.title, body: macro.body });
    setFormOpen(true);
  }

  async function saveForm(event) {
    event.preventDefault();
    const title = form.title.trim();
    const body = form.body.trim();
    if (title.length < 2) return toast.error("Informe um título.");
    if (body.length < 2) return toast.error("Escreva o conteúdo da resposta.");
    setSaving(true);
    const response = await fetch(form.id ? `/api/macros/${form.id}` : "/api/macros", {
      method: form.id ? "PUT" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, body }),
    });
    const result = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) return toast.error(result.error || "Não foi possível salvar.");
    setMacros(result.macros || []);
    setFormOpen(false);
    toast.success(form.id ? "Resposta atualizada." : "Resposta criada.");
  }

  async function deleteMacro(macro) {
    const res = await fetch(`/api/macros/${macro.id}`, { method: "DELETE" });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(result.error || "Não foi possível excluir.");
    setMacros(result.macros || []);
    toast.success("Resposta excluída.");
  }

  return (
    <div className="space-y-5 pb-6">
      <PageHeader
        icon={MessageSquareText}
        title="Respostas prontas"
        description="Biblioteca de respostas que os técnicos podem inserir ao responder ou resolver chamados."
        actions={<Button onClick={openCreate}><Plus /> Nova resposta</Button>}
      />

      {loading ? <ListLoadingSkeleton /> : macros.length === 0 ? (
        <ListEmptyState icon={Tags} title="Nenhuma resposta cadastrada" description="Crie respostas prontas para agilizar o atendimento da equipe." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {macros.map((macro) => (
            <Card key={macro.id} className="gap-2 rounded-2xl border-0 p-4 shadow-none ring-1 ring-foreground/10">
              <p className="text-sm font-semibold leading-snug">{macro.title}</p>
              <p className="line-clamp-3 text-xs text-muted-foreground">{macro.body}</p>
              <div className="mt-2 flex items-center justify-end gap-1">
                <Button size="icon" variant="ghost" className="size-7 text-muted-foreground" title="Editar" onClick={() => openEdit(macro)}>
                  <Pencil className="size-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="size-7 text-muted-foreground hover:text-destructive" title="Excluir" onClick={() => setDeleteTarget(macro)}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{form.id ? "Editar resposta" : "Nova resposta pronta"}</DialogTitle></DialogHeader>
          <form className="grid gap-4" onSubmit={saveForm}>
            <div className="space-y-1.5">
              <Label htmlFor="cr-title">Título</Label>
              <Input id="cr-title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Ex.: Reset de senha" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cr-body">Conteúdo</Label>
              <Textarea
                id="cr-body"
                value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                placeholder="Texto que será inserido na resposta..."
                rows={6}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(value) => !value && setDeleteTarget(null)}
        title="Excluir resposta"
        description={deleteTarget ? `Excluir a resposta "${deleteTarget.title}"?` : ""}
        onConfirm={() => { const target = deleteTarget; setDeleteTarget(null); if (target) deleteMacro(target); }}
      />
    </div>
  );
}
