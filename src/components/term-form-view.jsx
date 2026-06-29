"use client";



import { useEffect, useMemo, useState } from "react";

import { FileCheck2, ShieldCheck } from "lucide-react";

import { toast } from "sonner";

import { CrudFormLayout } from "@/components/crud-form-layout";

import { RichTextEditor } from "@/components/rich-text-editor";

import { Input } from "@/components/ui/input";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { toEditorHtml } from "@/lib/rich-text";



export function TermFormView({ assets, users, onCancel, onSigned }) {

  const [form, setForm] = useState({ assetId: assets[0]?.id || "", userId: "none", signerName: "", signerDocument: "", signatureText: "", bodyText: "" });

  const [submitting, setSubmitting] = useState(false);

  const selectedAsset = useMemo(() => assets.find((asset) => asset.id === form.assetId), [assets, form.assetId]);



  useEffect(() => {

    fetch("/api/term-templates", { cache: "no-store" }).then(async (response) => {

      if (!response.ok) return;

      const payload = await response.json();

      const template = (payload.templates || []).find((item) => item.active) || payload.templates?.[0];

      if (template?.bodyText) {

        setForm((current) => ({ ...current, bodyText: current.bodyText || toEditorHtml(template.bodyText) }));

      }

    });

  }, []);



  async function submit(event) {

    event.preventDefault();

    setSubmitting(true);

    const response = await fetch("/api/terms", {

      method: "POST",

      headers: { "content-type": "application/json" },

      body: JSON.stringify({ ...form, userId: form.userId === "none" ? null : form.userId }),

    });

    const result = await response.json().catch(() => ({}));

    setSubmitting(false);

    if (!response.ok) return toast.error(result.error || "Não foi possível gerar o termo.");

    toast.success("Termo assinado e PDF gerado.");

    onSigned();

    if (result.pdfUrl) window.open(result.pdfUrl, "_blank", "noopener,noreferrer");

    onCancel();

  }



  return (

    <CrudFormLayout

      title="Novo termo de equipamento"

      description="Revise o texto do termo, registre a assinatura e gere o PDF."

      onCancel={onCancel}

      onSubmit={submit}

      submitLabel="Assinar e gerar PDF"

      submitting={submitting}

      icon={FileCheck2}>

      <div className="sm:col-span-2"><p className="mb-2 text-sm font-medium">Equipamento</p><Select value={form.assetId} onValueChange={(assetId) => setForm((current) => ({ ...current, assetId }))}><SelectTrigger><SelectValue>{(value) => assets.find((asset) => asset.id === value)?.hostname}</SelectValue></SelectTrigger><SelectContent>{assets.map((asset) => <SelectItem key={asset.id} value={asset.id}>{asset.hostname} · {asset.patrimony_number || "sem patrimônio"}</SelectItem>)}</SelectContent></Select></div>

      <div className="sm:col-span-2 rounded-xl border bg-muted/40 p-3 text-sm"><p className="font-medium">{selectedAsset?.equipment_type || selectedAsset?.asset_type || "Equipamento"}</p><p className="text-xs text-muted-foreground">Patrimônio: {selectedAsset?.patrimony_number || "Não informado"}</p></div>

      <div className="sm:col-span-2"><p className="mb-2 text-sm font-medium">Usuário vinculado</p><Select value={form.userId} onValueChange={(userId) => setForm((current) => ({ ...current, userId }))}><SelectTrigger><SelectValue>{(value) => value === "none" ? "Não vincular" : users.find((user) => user.id === value)?.name}</SelectValue></SelectTrigger><SelectContent><SelectItem value="none">Não vincular</SelectItem>{users.map((user) => <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>)}</SelectContent></Select></div>

      <div><p className="mb-2 text-sm font-medium">Nome de quem assina</p><Input required value={form.signerName} onChange={(event) => setForm((current) => ({ ...current, signerName: event.target.value }))} /></div>

      <div><p className="mb-2 text-sm font-medium">Documento</p><Input value={form.signerDocument} onChange={(event) => setForm((current) => ({ ...current, signerDocument: event.target.value }))} placeholder="CPF, matrícula ou documento interno" /></div>

      <div className="sm:col-span-2"><p className="mb-2 text-sm font-medium">Assinatura</p><Input required value={form.signatureText} onChange={(event) => setForm((current) => ({ ...current, signatureText: event.target.value }))} placeholder="Digite o nome completo como assinatura" /></div>

      <div className="sm:col-span-2"><p className="mb-2 flex items-center gap-2 text-sm font-medium"><ShieldCheck className="size-4 text-muted-foreground" /> Texto do termo</p><RichTextEditor value={form.bodyText} onChange={(bodyText) => setForm((current) => ({ ...current, bodyText }))} minHeight="280px" placeholder="Texto exibido no termo e incluído no PDF" /></div>

    </CrudFormLayout>

  );

}


