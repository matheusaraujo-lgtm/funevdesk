"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, BookOpen, Clock3, LifeBuoy, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ContentDetailView, saveContentRequest } from "@/components/content-detail-view";
import { RichTextContent } from "@/components/rich-text-content";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// CTA "Não resolveu?" — reaproveitado nas duas visões.
function SupportCta({ onNewTicket }) {
  return (
    <Card className="rounded-2xl border-0 bg-gradient-to-br from-secondary/30 to-muted/40 shadow-none ring-1 ring-foreground/10">
      <CardContent className="flex flex-col items-start justify-between gap-3 p-5 sm:flex-row sm:items-center">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <LifeBuoy className="size-5" />
          </span>
          <div>
            <p className="font-semibold">Não resolveu?</p>
            <p className="text-sm text-muted-foreground">Abra um chamado e nossa equipe vai te ajudar.</p>
          </div>
        </div>
        <Button onClick={onNewTicket}><LifeBuoy /> Abrir chamado</Button>
      </CardContent>
    </Card>
  );
}

export function KnowledgeDetailView({ item, permissions, onBack, onEdit, onDeleted, onSaved, onNewTicket }) {
  const [article, setArticle] = useState(item);
  const [content, setContent] = useState(item?.content || "");
  const [loading, setLoading] = useState(Boolean(item?.id));
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!item?.id) return;
    let ignore = false;
    // Fetch com cancelamento (flag ignore) para evitar resposta defasada ao trocar de artigo.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetch(`/api/knowledge/${item.id}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (ignore || !payload?.article) return;
        setArticle(payload.article);
        setContent(payload.article.content || "");
      })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, [item?.id]);

  async function save() {
    await saveContentRequest(`/api/knowledge/${article.id}`, "PUT", {
      branchId: article.branch_id,
      title: article.title,
      category: article.category,
      content,
    }, "Artigo salvo.");
    onSaved?.();
  }

  async function remove() {
    const response = await fetch(`/api/knowledge/${article.id}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) return toast.error(result.error || "Não foi possível excluir.");
    toast.success("Artigo excluído.");
    onDeleted?.();
    onBack();
  }

  // Quem gerencia continua com o editor inline (ContentDetailView).
  if (permissions.canManageTickets) {
    return (
      <>
        <ContentDetailView
          title={article?.title || "Artigo"}
          description="Base de conhecimento para orientar usuários e equipe."
          loading={loading}
          badges={[
            { label: article?.category || "Categoria", variant: "outline" },
            { label: article?.branch_name || "Global" },
          ]}
          content={content}
          onContentChange={setContent}
          canEdit
          allowImages
          allowVideos
          onBack={onBack}
          onSave={save}
          meta={article?.updated_at ? <p className="text-muted-foreground">Atualizado em {new Date(article.updated_at).toLocaleString("pt-BR")}</p> : null}
          actions={
            <>
              <Button variant="outline" onClick={() => onEdit?.(article)}><Pencil /> Editar dados</Button>
              {permissions.canConfigure && <Button variant="destructive" onClick={() => setConfirmOpen(true)}><Trash2 /> Excluir</Button>}
            </>
          }
        />
        {!loading && onNewTicket && <SupportCta onNewTicket={onNewTicket} />}
      </>
    );
  }

  // Leitor (colaborador): experiência de leitura repaginada.
  if (loading) {
    return (
      <div className="space-y-5 pb-6">
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-[360px] w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-6">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/[0.07] via-card to-secondary/25 px-5 py-5 ring-1 ring-foreground/10 sm:px-6">
        <div className="flex items-start gap-3.5">
          <Button type="button" variant="outline" size="icon" className="mt-0.5 bg-card/70" onClick={onBack} aria-label="Voltar">
            <ArrowLeft />
          </Button>
          <span className="hidden size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm sm:flex">
            <BookOpen className="size-5" />
          </span>
          <div className="min-w-0">
            <h1 className="page-title text-[26px]">{article?.title || "Artigo"}</h1>
            <p className="page-copy">Tire sua dúvida com este artigo da nossa central de ajuda.</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {article?.category && <Badge variant="outline">{article.category}</Badge>}
              <Badge variant="secondary">{article?.branch_name || "Global"}</Badge>
              {article?.updated_at && (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock3 className="size-3.5" /> Atualizado em {new Date(article.updated_at).toLocaleDateString("pt-BR")}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <Card className="rounded-2xl border-0 shadow-none ring-1 ring-foreground/10">
        <CardContent className="p-5 md:p-7">
          {content ? (
            <RichTextContent value={content} className="text-[15px] leading-7" />
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum conteúdo cadastrado.</p>
          )}
        </CardContent>
      </Card>

      {onNewTicket && <SupportCta onNewTicket={onNewTicket} />}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Excluir artigo"
        description={article ? `Excluir "${article.title}"? A exclusão só é permitida se não houver registros vinculados.` : ""}
        onConfirm={() => { setConfirmOpen(false); remove(); }}
      />
    </div>
  );
}
