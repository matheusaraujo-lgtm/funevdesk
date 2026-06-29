"use client";



import { useState } from "react";

import { Building2, FileText } from "lucide-react";

import { toast } from "sonner";

import { CrudFormLayout } from "@/components/crud-form-layout";

import { RichTextEditor } from "@/components/rich-text-editor";

import { Input } from "@/components/ui/input";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";



export function DocumentationFormView({ item, branches, permissions, onCancel, onSaved }) {

  const [form, setForm] = useState({

    branchId: item?.branch_id || branches[0]?.id || "",

    title: item?.title || "",

    documentType: item?.document_type || "Operacional",

    content: item?.content || "",

  });

  const [submitting, setSubmitting] = useState(false);



  async function submit(event) {

    event.preventDefault();

    setSubmitting(true);

    const response = await fetch(item ? `/api/documents/${item.id}` : "/api/documents", {

      method: item ? "PUT" : "POST",

      headers: { "content-type": "application/json" },

      body: JSON.stringify(form),

    });

    const result = await response.json();

    setSubmitting(false);

    if (!response.ok) return toast.error(result.error || "Não foi possível salvar a documentação.");

    toast.success(item ? "Documentação atualizada." : "Documentação salva.");

    onSaved();

    onCancel();

  }



  return (

    <CrudFormLayout

      title={item ? "Editar documento" : "Novo documento"}

      description="Informações técnicas por unidade para operação e suporte."

      onCancel={onCancel}

      onSubmit={submit}

      submitLabel={item ? "Salvar alterações" : "Salvar documentação"}

      submitting={submitting}

      submitDisabled={!permissions.canManageTickets}

      icon={FileText}>

      <div className="sm:col-span-2"><p className="mb-2 text-sm font-medium">Unidade</p><Select value={form.branchId} onValueChange={(branchId) => setForm((current) => ({ ...current, branchId }))}><SelectTrigger><Building2 className="size-4 text-muted-foreground" /><SelectValue>{(value) => branches.find((branch) => branch.id === value)?.name}</SelectValue></SelectTrigger><SelectContent>{branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}</SelectContent></Select></div>

      <div><p className="mb-2 text-sm font-medium">Tipo</p><Input value={form.documentType} onChange={(event) => setForm((current) => ({ ...current, documentType: event.target.value }))} /></div>

      <div className="sm:col-span-2"><p className="mb-2 text-sm font-medium">Título</p><Input required value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Ex.: Links e contatos da filial" /></div>

      <div className="sm:col-span-2"><p className="mb-2 text-sm font-medium">Conteúdo</p><RichTextEditor value={form.content} onChange={(content) => setForm((current) => ({ ...current, content }))} minHeight="360px" placeholder="Descreva as informações técnicas da unidade" /></div>

    </CrudFormLayout>

  );

}


