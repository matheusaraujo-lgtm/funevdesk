"use client";



import { useEffect, useState } from "react";

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
  const [documentTypes, setDocumentTypes] = useState([]);

  useEffect(() => {
    fetch("/api/document-types", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { documentTypes: [] }))
      .then((data) => setDocumentTypes(data.documentTypes || []))
      .catch(() => setDocumentTypes([]));
  }, []);

  // Inclui o valor atual mesmo que não esteja na lista (docs antigos com tipo livre).
  const typeOptions = documentTypes.map((type) => type.name);
  const allTypeOptions = form.documentType && !typeOptions.includes(form.documentType)
    ? [form.documentType, ...typeOptions]
    : typeOptions;

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

      <div><p className="mb-2 text-sm font-medium">Tipo</p>
        <Select value={form.documentType} onValueChange={(value) => setForm((current) => ({ ...current, documentType: value }))}>
          <SelectTrigger aria-label="Tipo de documento"><SelectValue placeholder="Selecione o tipo">{(value) => value || "Selecione o tipo"}</SelectValue></SelectTrigger>
          <SelectContent>
            {allTypeOptions.length === 0
              ? <SelectItem value="Operacional">Operacional</SelectItem>
              : allTypeOptions.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="sm:col-span-2"><p className="mb-2 text-sm font-medium">Título</p><Input required value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Ex.: Links e contatos da filial" /></div>

      <div className="sm:col-span-2"><p className="mb-2 text-sm font-medium">Conteúdo</p><RichTextEditor value={form.content} onChange={(content) => setForm((current) => ({ ...current, content }))} minHeight="360px" placeholder="Descreva as informações técnicas da unidade" /></div>

    </CrudFormLayout>

  );

}


