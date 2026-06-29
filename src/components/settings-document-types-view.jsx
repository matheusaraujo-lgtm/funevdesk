"use client";

import { useEffect, useState } from "react";
import { FileText, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ListEmptyState } from "@/components/list-empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function SettingsDocumentTypesView() {
  const [types, setTypes] = useState([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const response = await fetch("/api/document-types", { cache: "no-store" });
      const data = await response.json();
      if (response.ok) setTypes(data.documentTypes || []);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function add() {
    const value = name.trim();
    if (value.length < 2) return toast.error("Informe o nome do tipo de documento.");
    setBusy(true);
    try {
      const response = await fetch("/api/document-types", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: value }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Não foi possível adicionar.");
      setTypes(data.documentTypes || []);
      setName("");
      toast.success("Tipo de documento adicionado.");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    setBusy(true);
    try {
      const response = await fetch(`/api/document-types/${id}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Não foi possível remover.");
      setTypes(data.documentTypes || []);
      toast.success("Tipo de documento removido.");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5 pb-6">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/[0.07] via-card to-secondary/25 px-5 py-5 ring-1 ring-foreground/10 sm:px-6">
        <div className="flex items-start gap-3.5">
          <span className="hidden size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm sm:flex"><FileText className="size-5" /></span>
          <div>
            <h1 className="page-title text-[26px]">Tipos de documento</h1>
            <p className="page-copy max-w-md">Lista usada no campo "Tipo" da Documentação. Cadastre os tipos que sua equipe usa.</p>
          </div>
        </div>
      </div>

      <Card className="rounded-2xl border-0 shadow-none ring-1 ring-foreground/10">
        <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Novo tipo (ex.: Política de segurança)" disabled={busy} onKeyDown={(event) => { if (event.key === "Enter") add(); }} />
          <Button type="button" disabled={busy || name.trim().length < 2} onClick={add}>{busy ? <LoaderCircle className="animate-spin" /> : <Plus />} Adicionar</Button>
        </CardContent>
      </Card>

      <Card className="gap-0 overflow-hidden rounded-2xl border-0 py-0 shadow-none ring-1 ring-foreground/10">
        <div className="border-b p-4"><p className="flex items-center gap-2.5 font-heading text-sm font-bold"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><FileText className="size-[18px]" /></span>Tipos cadastrados ({types.length})</p></div>
        {loading ? (
          <p className="px-4 py-8 text-center text-xs text-muted-foreground">Carregando...</p>
        ) : types.length === 0 ? (
          <ListEmptyState icon={FileText} title="Nenhum tipo cadastrado" description="Adicione acima os tipos de documento que poderão ser selecionados na Documentação." />
        ) : (
          <div className="p-2">
            {types.map((type) => (
              <div key={type.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5">
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{type.name}</span>
                <Button type="button" variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" disabled={busy} onClick={() => remove(type.id)} aria-label={`Remover ${type.name}`}><Trash2 className="size-4" /></Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
