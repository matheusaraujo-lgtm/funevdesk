"use client";

import { useCallback, useState } from "react";
import { ExternalLink, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useReloadableData } from "@/lib/use-reloadable-data";
import { ContentDetailView, saveContentRequest } from "@/components/content-detail-view";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export function TermDetailView({ item, permissions, onBack, onDeleted }) {
  const [term, setTerm] = useState(item);
  const [content, setContent] = useState(item?.body_text || item?.bodyText || "");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { loading } = useReloadableData(useCallback(async () => {
    if (!item?.id) return;
    const response = await fetch(`/api/terms/${item.id}`, { cache: "no-store" });
    if (response.ok) {
      const payload = await response.json();
      setTerm(payload.term);
      setContent(payload.term.body_text || "");
    }
  }, [item?.id]));

  async function remove() {
    const response = await fetch(`/api/terms/${term.id}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) return toast.error(result.error || "Não foi possível excluir.");
    toast.success("Termo excluído.");
    onDeleted?.();
    onBack();
  }

  return (
    <>
    <ContentDetailView
      title={term?.signer_name || "Termo de equipamento"}
      description={`${term?.hostname || "Equipamento"} · ${term?.branch_name || "Unidade"}`}
      loading={loading}
      badges={[
        { label: term?.status || "ASSINADO", variant: "outline" },
        { label: term?.created_at ? new Date(term.created_at).toLocaleString("pt-BR") : "—" },
      ]}
      content={content}
      readOnly
      canEdit={false}
      onBack={onBack}
      meta={(
        <>
          <p><span className="text-muted-foreground">Documento:</span> {term?.signer_document || "Não informado"}</p>
          <p><span className="text-muted-foreground">Assinatura:</span> {term?.signature_text}</p>
          <p><span className="text-muted-foreground">Patrimônio:</span> {term?.patrimony_number || "—"}</p>
        </>
      )}
      actions={(
        <>
          {term?.pdf_url && (
            <Button variant="secondary" asChild>
              <a href={term.pdf_url} target="_blank" rel="noreferrer"><ExternalLink /> Abrir PDF</a>
            </Button>
          )}
          {permissions?.canConfigure && (
            <Button variant="destructive" onClick={() => setConfirmOpen(true)}><Trash2 /> Excluir</Button>
          )}
        </>
      )}
    />
    <ConfirmDialog
      open={confirmOpen}
      onOpenChange={setConfirmOpen}
      title="Excluir termo"
      description={term ? `Excluir o termo de ${term.signer_name}? Esta ação não pode ser desfeita.` : ""}
      onConfirm={() => { setConfirmOpen(false); remove(); }}
    />
    </>
  );
}

export function TermTemplateDetailView({ item, permissions, onBack, onEdit, onDeleted, onSaved }) {
  const [template, setTemplate] = useState(item);
  const [content, setContent] = useState(item?.bodyText || item?.body_text || "");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { loading } = useReloadableData(useCallback(async () => {
    if (!item?.id) return;
    const response = await fetch(`/api/term-templates/${item.id}`, { cache: "no-store" });
    if (response.ok) {
      const payload = await response.json();
      setTemplate(payload.template);
      setContent(payload.template.bodyText || payload.template.body_text || "");
    }
  }, [item?.id]));

  async function save() {
    await saveContentRequest(`/api/term-templates/${template.id}`, "PUT", {
      name: template.name,
      title: template.title,
      bodyText: content,
      active: Boolean(template.active),
    }, "Modelo salvo.");
    onSaved?.();
  }

  async function remove() {
    const response = await fetch(`/api/term-templates/${template.id}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) return toast.error(result.error || "Não foi possível excluir.");
    toast.success("Modelo excluído.");
    onDeleted?.();
    onBack();
  }

  return (
    <>
    <ContentDetailView
      title={template?.title || template?.name || "Modelo de termo"}
      description={template?.name || "Texto do termo de equipamento."}
      loading={loading}
      badges={[
        { label: template?.active ? "Ativo" : "Inativo", variant: template?.active ? "success" : "muted" },
      ]}
      content={content}
      onContentChange={setContent}
      canEdit={permissions.canConfigure}
      onBack={onBack}
      onSave={save}
      actions={permissions.canConfigure ? (
        <>
          <Button variant="outline" onClick={() => onEdit?.(template)}><Pencil /> Editar dados</Button>
          <Button variant="destructive" onClick={() => setConfirmOpen(true)}><Trash2 /> Excluir</Button>
        </>
      ) : null}
    />
    <ConfirmDialog
      open={confirmOpen}
      onOpenChange={setConfirmOpen}
      title="Excluir modelo de termo"
      description={template ? `Excluir "${template.name}"? A exclusão só é permitida se não houver registros vinculados.` : ""}
      onConfirm={() => { setConfirmOpen(false); remove(); }}
    />
    </>
  );
}
