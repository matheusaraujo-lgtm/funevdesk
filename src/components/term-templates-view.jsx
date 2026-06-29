"use client";

import { useCallback, useState } from "react";
import { CheckCircle2, FileText, MoreVertical, Pencil, Plus, Search, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useReloadableData } from "@/lib/use-reloadable-data";
import { ListEmptyState } from "@/components/list-empty-state";
import { ListLoadingSkeleton } from "@/components/list-loading-skeleton";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RichTextEditor } from "@/components/rich-text-editor";
import { TermCanvasEditor, defaultTermLayout } from "@/components/term-canvas-editor";
import { plainTextPreview } from "@/lib/rich-text";

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

export function TermTemplatesView({ onNew, onEdit, onOpen }) {
  const [templates, setTemplates] = useState([]);
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { loading } = useReloadableData(useCallback(async () => {
    const response = await fetch("/api/term-templates", { cache: "no-store" });
    if (response.ok) setTemplates((await response.json()).templates);
  }, []));

  const filtered = templates.filter((t) => `${t.name} ${t.title} ${plainTextPreview(t.bodyText, 500)}`.toLowerCase().includes(search.toLowerCase()));

  async function remove(template) {
    const response = await fetch(`/api/term-templates/${template.id}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) return toast.error(result.error || "Não foi possível excluir.");
    toast.success("Modelo excluído.");
    setDeleteTarget(null);
    setTemplates(result.templates);
  }

  return <div className="space-y-5 pb-6">
    {/* Header em destaque, no mesmo estilo do restante do app. */}
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/[0.07] via-card to-secondary/25 px-5 py-5 ring-1 ring-foreground/10 sm:px-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-start gap-3.5">
          <span className="hidden size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm sm:flex"><FileText className="size-5" /></span>
          <div>
            <h1 className="page-title text-[26px]">Modelos de termo</h1>
            <p className="page-copy max-w-md">Textos configuráveis para termos de equipamento nos chamados.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2"><Button onClick={onNew}><Plus /> Novo modelo</Button></div>
      </div>
    </div>
    <div className="grid gap-4 sm:grid-cols-3"><MetricCard icon={FileText} label="Total" value={templates.length} /><MetricCard icon={CheckCircle2} label="Ativos" value={templates.filter((t) => t.active).length} /><MetricCard icon={XCircle} label="Inativos" value={templates.filter((t) => !t.active).length} /></div>
    <Card className="overflow-hidden gap-0 rounded-2xl border-0 py-0 shadow-none ring-1 ring-foreground/10">
      <div className="border-b p-4"><div className="relative max-w-md"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar modelo..." /></div></div>
      {loading ? <ListLoadingSkeleton /> : filtered.length === 0 ? (
        <ListEmptyState
          icon={FileText}
          title={search ? "Nenhum modelo encontrado" : "Nenhum modelo cadastrado"}
          description={search ? "Tente outro termo de busca." : "Cadastre modelos de termo para uso nos chamados com equipamento."}
          actionLabel={!search ? "Novo modelo" : undefined}
          onAction={!search ? onNew : undefined}
        />
      ) : (
      <div className="overflow-x-auto"><Table><TableHeader><TableRow className="bg-muted/10"><TableHead>Nome</TableHead><TableHead>Título</TableHead><TableHead>Status</TableHead><TableHead className="w-12" /></TableRow></TableHeader><TableBody>{filtered.map((template) => <TableRow key={template.id} className="cursor-pointer" onClick={() => onOpen?.(template)}><TableCell><div className="flex items-center gap-3"><div className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary"><FileText className="size-4" /></div><div><p className="font-medium">{template.name}</p><p className="line-clamp-1 text-xs text-muted-foreground">{plainTextPreview(template.bodyText)}</p></div></div></TableCell><TableCell>{template.title}</TableCell><TableCell><Badge variant={template.active ? "success" : "muted"}>{template.active ? "Ativo" : "Inativo"}</Badge></TableCell><TableCell onClick={(event) => event.stopPropagation()}><DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon" />}><MoreVertical /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => onOpen?.(template)}>Abrir</DropdownMenuItem><DropdownMenuItem onClick={() => onEdit(template)}><Pencil /> Editar dados</DropdownMenuItem><DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(template)}><Trash2 /> Excluir</DropdownMenuItem></DropdownMenuContent></DropdownMenu></TableCell></TableRow>)}</TableBody></Table></div>
      )}
    </Card>
    <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}><DialogContent><DialogHeader><DialogTitle>Excluir modelo</DialogTitle></DialogHeader><p className="text-sm">Excluir <strong>{deleteTarget?.name}</strong>?</p><DialogFooter><Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button><Button variant="destructive" onClick={() => deleteTarget && remove(deleteTarget)}>Excluir</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

export function TermTemplateFormView({ item, onCancel, onSaved }) {
  const [form, setForm] = useState({ name: item?.name || "", title: item?.title || "", bodyText: item?.bodyText || item?.body_text || "" });
  const [layout, setLayout] = useState(() => item?.layoutJson || defaultTermLayout({ title: item?.title || "TERMO DE USO DE EQUIPAMENTO" }));
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});

  async function submit(event) {
    event.preventDefault();
    const nextErrors = {};
    if (form.name.trim().length < 2) nextErrors.name = "Informe um nome interno (mín. 2 caracteres).";
    if (form.title.trim().length < 2) nextErrors.title = "Informe o título do documento.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return toast.error("Revise os campos destacados.");
    setSubmitting(true);
    const response = await fetch(item ? `/api/term-templates/${item.id}` : "/api/term-templates", {
      method: item ? "PUT" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...form, layoutJson: layout }),
    });
    const result = await response.json();
    setSubmitting(false);
    if (!response.ok) return toast.error(result.error || "Não foi possível salvar.");
    toast.success(item ? "Modelo atualizado." : "Modelo criado.");
    onSaved?.();
    onCancel();
  }

  return <form className="space-y-5 pb-6" onSubmit={submit}>
    <PageHeader
      icon={FileText}
      title={item ? "Editar modelo" : "Novo modelo de termo"}
      description="Define o layout e o texto incluído no PDF do termo."
      actions={<><Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button><Button type="submit" disabled={submitting}>Salvar</Button></>}
    />
    <Card className="rounded-2xl border-0 p-6 shadow-none ring-1 ring-foreground/10 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div><p className="mb-2 text-sm font-medium">Nome interno</p><Input aria-invalid={errors.name ? true : undefined} value={form.name} onChange={(e) => { setForm((c) => ({ ...c, name: e.target.value })); if (errors.name) setErrors((p) => ({ ...p, name: undefined })); }} />{errors.name && <p className="mt-1.5 text-xs text-destructive">{errors.name}</p>}</div>
        <div><p className="mb-2 text-sm font-medium">Título do documento</p><Input aria-invalid={errors.title ? true : undefined} value={form.title} onChange={(e) => { setForm((c) => ({ ...c, title: e.target.value })); if (errors.title) setErrors((p) => ({ ...p, title: undefined })); }} />{errors.title && <p className="mt-1.5 text-xs text-destructive">{errors.title}</p>}</div>
      </div>
      <div><p className="mb-2 text-sm font-medium">Texto do termo (usado no campo &quot;Texto do termo&quot; do layout)</p><RichTextEditor value={form.bodyText} onChange={(bodyText) => setForm((c) => ({ ...c, bodyText }))} minHeight="200px" /></div>
    </Card>
    <Card className="rounded-2xl border-0 p-6 shadow-none ring-1 ring-foreground/10 space-y-3">
      <div><p className="text-sm font-medium">Layout do PDF</p><p className="text-xs text-muted-foreground">Arraste textos, campos dinâmicos, imagens e o bloco de assinatura. O técnico poderá ajustar este layout por chamado.</p></div>
      <TermCanvasEditor value={layout} onChange={setLayout} />
    </Card>
  </form>;
}
