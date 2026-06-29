"use client";



import { useState } from "react";

import { BookOpen } from "lucide-react";

import { toast } from "sonner";

import { CrudFormLayout } from "@/components/crud-form-layout";

import { RichTextEditor } from "@/components/rich-text-editor";

import { isRichTextEmpty } from "@/lib/rich-text";

import { Input } from "@/components/ui/input";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";



export function KnowledgeFormView({ item, branches, permissions, onCancel, onSaved }) {

  const [form, setForm] = useState({

    branchId: item?.branch_id || "global",

    title: item?.title || "",

    category: item?.category || "Suporte",

    content: item?.content || "",

  });

  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});

  async function submit(event) {

    event.preventDefault();

    const nextErrors = {};
    if (!form.category.trim()) nextErrors.category = "Informe a categoria.";
    if (form.title.trim().length < 3) nextErrors.title = "O título precisa de ao menos 3 caracteres.";
    if (isRichTextEmpty(form.content)) nextErrors.content = "Escreva o conteúdo do artigo.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return toast.error("Revise os campos destacados.");

    setSubmitting(true);

    const payload = { ...form, branchId: form.branchId === "global" ? null : form.branchId };

    const response = await fetch(item ? `/api/knowledge/${item.id}` : "/api/knowledge", {

      method: item ? "PUT" : "POST",

      headers: { "content-type": "application/json" },

      body: JSON.stringify(payload),

    });

    const result = await response.json();

    setSubmitting(false);

    if (!response.ok) return toast.error(result.error || "Não foi possível publicar o artigo.");

    toast.success(item ? "Artigo atualizado." : "Artigo publicado.");

    onSaved();

    onCancel();

  }



  return (

    <CrudFormLayout

      title={item ? "Editar artigo" : "Novo artigo"}

      description="Orientações para usuários e equipe de suporte."

      onCancel={onCancel}

      onSubmit={submit}

      submitLabel={item ? "Salvar alterações" : "Publicar artigo"}

      submitting={submitting}

      submitDisabled={!permissions.canManageTickets}

      icon={BookOpen}>

      <div><p className="mb-2 text-sm font-medium">Escopo</p><Select value={form.branchId} onValueChange={(branchId) => setForm((current) => ({ ...current, branchId }))}><SelectTrigger><SelectValue>{(value) => value === "global" ? "Global" : branches.find((branch) => branch.id === value)?.name}</SelectValue></SelectTrigger><SelectContent><SelectItem value="global">Global</SelectItem>{branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}</SelectContent></Select></div>

      <div><p className="mb-2 text-sm font-medium">Categoria</p><Input aria-invalid={errors.category ? true : undefined} value={form.category} onChange={(event) => { setForm((current) => ({ ...current, category: event.target.value })); if (errors.category) setErrors((p) => ({ ...p, category: undefined })); }} />{errors.category && <p className="mt-1.5 text-xs text-destructive">{errors.category}</p>}</div>

      <div className="sm:col-span-2"><p className="mb-2 text-sm font-medium">Título</p><Input aria-invalid={errors.title ? true : undefined} value={form.title} onChange={(event) => { setForm((current) => ({ ...current, title: event.target.value })); if (errors.title) setErrors((p) => ({ ...p, title: undefined })); }} />{errors.title && <p className="mt-1.5 text-xs text-destructive">{errors.title}</p>}</div>

      <div className="sm:col-span-2"><p className="mb-2 text-sm font-medium">Conteúdo</p><RichTextEditor value={form.content} onChange={(content) => { setForm((current) => ({ ...current, content })); if (errors.content) setErrors((p) => ({ ...p, content: undefined })); }} minHeight="360px" allowImages allowVideos />{errors.content && <p className="mt-1.5 text-xs text-destructive">{errors.content}</p>}</div>

    </CrudFormLayout>

  );

}


