"use client";

import { useCallback, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useReloadableData } from "@/lib/use-reloadable-data";
import { ContentDetailView, saveContentRequest } from "@/components/content-detail-view";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export function DocumentationDetailView({ item, permissions, onBack, onEdit, onDeleted, onSaved }) {
  const [doc, setDoc] = useState(item);
  const [content, setContent] = useState(item?.content || "");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { loading } = useReloadableData(useCallback(async () => {
    if (!item?.id) return;
    const response = await fetch(`/api/documents/${item.id}`, { cache: "no-store" });
    if (response.ok) {
      const payload = await response.json();
      setDoc(payload.document);
      setContent(payload.document.content || "");
    }
  }, [item?.id]));

  async function save() {
    await saveContentRequest(`/api/documents/${doc.id}`, "PUT", {
      branchId: doc.branch_id,
      title: doc.title,
      documentType: doc.document_type,
      content,
    }, "Documentação salva.");
    onSaved?.();
  }

  async function remove() {
    const response = await fetch(`/api/documents/${doc.id}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) return toast.error(result.error || "Não foi possível excluir.");
    toast.success("Documentação excluída.");
    onDeleted?.();
    onBack();
  }

  return (
    <>
    <ContentDetailView
      title={doc?.title || "Documento"}
      description="Documentação técnica da unidade."
      loading={loading}
      badges={[
        { label: doc?.branch_name || "Unidade" },
        { label: doc?.document_type || "Tipo", variant: "outline" },
      ]}
      content={content}
      onContentChange={setContent}
      canEdit={permissions.canManageTickets}
      onBack={onBack}
      onSave={save}
      meta={doc?.updated_at ? <p className="text-muted-foreground">Atualizado em {new Date(doc.updated_at).toLocaleString("pt-BR")}</p> : null}
      actions={(permissions.canManageTickets || permissions.canConfigure) ? (
        <>
          {permissions.canManageTickets && <Button variant="outline" onClick={() => onEdit?.(doc)}><Pencil /> Editar dados</Button>}
          {permissions.canConfigure && <Button variant="destructive" onClick={() => setConfirmOpen(true)}><Trash2 /> Excluir</Button>}
        </>
      ) : null}
    />
    <ConfirmDialog
      open={confirmOpen}
      onOpenChange={setConfirmOpen}
      title="Excluir documento"
      description={doc ? `Excluir "${doc.title}"? A exclusão só é permitida se não houver registros vinculados.` : ""}
      onConfirm={() => { setConfirmOpen(false); remove(); }}
    />
    </>
  );
}
