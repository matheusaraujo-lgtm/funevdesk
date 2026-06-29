"use client";

import { useState } from "react";
import { ArrowLeft, Pencil, Save } from "lucide-react";
import { toast } from "sonner";
import { RichTextEditor } from "@/components/rich-text-editor";
import { RichTextContent } from "@/components/rich-text-content";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function ContentDetailView({
  title,
  description,
  badges = [],
  content,
  onContentChange,
  readOnly = false,
  canEdit = false,
  allowImages = false,
  allowVideos = false,
  onBack,
  onSave,
  loading = false,
  meta,
  actions,
}) {
  const [saving, setSaving] = useState(false);
  // Abre em LEITURA por padrão; quem pode editar entra no editor por ação explícita.
  const [editing, setEditing] = useState(false);
  const editable = canEdit && !readOnly;

  async function handleSave() {
    if (!onSave) return;
    setSaving(true);
    try {
      await onSave();
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-5 pb-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[420px] w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="flex items-start gap-3">
          <Button type="button" variant="outline" size="icon" onClick={onBack} aria-label="Voltar">
            <ArrowLeft />
          </Button>
          <div>
            <h1 className="page-title text-[26px]">{title}</h1>
            {description && <p className="page-copy">{description}</p>}
            {badges.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {badges.map((badge) => (
                  <Badge key={badge.label} variant={badge.variant || "secondary"}>{badge.label}</Badge>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {actions}
          {editable && !editing && (
            <Button variant="outline" onClick={() => setEditing(true)}><Pencil /> Editar conteúdo</Button>
          )}
          {editing && onSave && (
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Save className="animate-pulse" /> : <Save />}
              {saving ? "Salvando…" : "Salvar conteúdo"}
            </Button>
          )}
          {editing && (
            <Button variant="ghost" onClick={() => setEditing(false)} disabled={saving}>Cancelar</Button>
          )}
        </div>
      </div>

      {meta && (
        <Card className="rounded-xl py-0 shadow-none">
          <CardContent className="grid gap-3 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">{meta}</CardContent>
        </Card>
      )}

      {editing ? (
        <RichTextEditor
          value={content}
          onChange={onContentChange}
          minHeight="480px"
          placeholder="Escreva o conteúdo…"
          allowImages={allowImages}
          allowVideos={allowVideos}
        />
      ) : (
        <Card className="rounded-xl py-0 shadow-none">
          <CardContent className="p-4 md:p-6">
            {content ? (
              <RichTextContent value={content} className="text-base" />
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum conteúdo cadastrado.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export async function saveContentRequest(url, method, payload, successMessage) {
  const response = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    toast.error(result.error || "Não foi possível salvar.");
    throw new Error(result.error || "save failed");
  }
  if (successMessage) toast.success(successMessage);
  return result;
}
