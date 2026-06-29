"use client";

import { useEffect, useState } from "react";
import { FileCheck2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { RichTextEditor } from "@/components/rich-text-editor";
import { TermCanvasEditor, defaultTermLayout } from "@/components/term-canvas-editor";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { isRichTextEmpty } from "@/lib/rich-text";

function parseLayout(value) {
  if (!value) return null;
  try {
    return typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    return null;
  }
}

export function TicketTermPrepareDialog({ open, onOpenChange, ticket, assets = [], users = [], template, equipmentTerm, onPrepared }) {
  const [signerUserId, setSignerUserId] = useState("");
  const [assetId, setAssetId] = useState(ticket?.asset_id || "");
  const [signerName, setSignerName] = useState("");
  const [signerDocument, setSignerDocument] = useState("");
  const [title, setTitle] = useState(template?.title || "Termo de equipamento");
  const [bodyHtml, setBodyHtml] = useState(template?.bodyHtml || template?.bodyText || "");
  const [layout, setLayout] = useState(() => parseLayout(equipmentTerm?.layout_json) || template?.layoutJson || defaultTermLayout({ title: template?.title }));
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Preenche o formulário do termo a partir do chamado/template quando o diálogo abre.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAssetId(ticket?.asset_id || assets[0]?.id || "");
    setSignerUserId(equipmentTerm?.signer_user_id || "");
    setSignerName(equipmentTerm?.signer_name || "");
    setSignerDocument(equipmentTerm?.signer_document || "");
    setTitle(equipmentTerm?.title || template?.title || "Termo de equipamento");
    setBodyHtml(equipmentTerm?.body_html || template?.bodyHtml || template?.bodyText || "");
    setLayout(parseLayout(equipmentTerm?.layout_json) || template?.layoutJson || defaultTermLayout({ title: template?.title }));
  }, [open, ticket, assets, template, equipmentTerm]);

  useEffect(() => {
    const user = users.find((u) => u.id === signerUserId);
    // Autopreenche o nome do signatário ao escolher o usuário.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (user && !signerName) setSignerName(user.name);
  }, [signerUserId, users, signerName]);

  async function submit(event) {
    event.preventDefault();
    if (!signerUserId || !assetId || isRichTextEmpty(bodyHtml)) {
      return toast.error("Preencha signatário, equipamento e conteúdo do termo.");
    }
    setSubmitting(true);
    const response = await fetch(`/api/tickets/${ticket.id}/terms`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "prepare", signerUserId, assetId, signerName, signerDocument, title, bodyHtml, layoutJson: layout }),
    });
    const result = await response.json();
    setSubmitting(false);
    if (!response.ok) return toast.error(result.error || "Não foi possível preparar o termo.");
    toast.success("Termo enviado para assinatura.");
    onOpenChange(false);
    onPrepared?.(result);
  }

  const branchAssets = assets.filter((asset) => !ticket?.branch_id || asset.branch_id === ticket.branch_id || asset.branch_id === ticket.origin_branch_id);
  const signers = users.filter((u) => u.active && u.role !== "ADMIN");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileCheck2 className="size-5 text-primary" />Preparar termo de equipamento</DialogTitle>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1.5 text-sm font-medium">Usuário que vai assinar</p>
              <Select value={signerUserId} onValueChange={setSignerUserId}>
                <SelectTrigger><SelectValue placeholder="Selecione...">{(current) => signers.find((u) => u.id === current)?.name || "Selecione..."}</SelectValue></SelectTrigger>
                <SelectContent>{signers.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <p className="mb-1.5 text-sm font-medium">Equipamento vinculado</p>
              <Select value={assetId} onValueChange={setAssetId}>
                <SelectTrigger><SelectValue placeholder="Selecione...">{(current) => branchAssets.find((a) => a.id === current)?.hostname || "Selecione..."}</SelectValue></SelectTrigger>
                <SelectContent>{branchAssets.map((a) => <SelectItem key={a.id} value={a.id}>{a.hostname}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Input placeholder="Nome no termo" value={signerName} onChange={(e) => setSignerName(e.target.value)} required />
            <Input placeholder="Documento (CPF/RG)" value={signerDocument} onChange={(e) => setSignerDocument(e.target.value)} />
            <Input className="sm:col-span-2" placeholder="Título do documento" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <p className="mb-1.5 text-sm font-medium">Texto do termo (campo &quot;Texto do termo&quot; do layout)</p>
            <RichTextEditor value={bodyHtml} onChange={setBodyHtml} minHeight="160px" allowImages />
          </div>
          <div>
            <p className="mb-1.5 text-sm font-medium">Layout do documento (PDF)</p>
            <TermCanvasEditor value={layout} onChange={setLayout} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={submitting}>{submitting ? <Loader2 className="animate-spin" /> : null}Enviar para assinatura</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TicketTermSignDialog({ open, onOpenChange, ticket, equipmentTerm, onSigned }) {
  const [password, setPassword] = useState("");
  const [signatureText, setSignatureText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (!password.trim()) return toast.error("Digite sua senha para confirmar.");
    setSubmitting(true);
    const response = await fetch(`/api/tickets/${ticket.id}/terms`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password, signatureText: signatureText || undefined }),
    });
    const result = await response.json();
    setSubmitting(false);
    if (!response.ok) return toast.error(result.error || "Não foi possível assinar.");
    toast.success("Termo assinado com sucesso.");
    onOpenChange(false);
    setPassword("");
    if (result.pdfUrl && typeof window !== "undefined") window.open(result.pdfUrl, "_blank", "noopener");
    onSigned?.(result);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Assinar termo de equipamento</DialogTitle></DialogHeader>
        <form className="grid gap-3" onSubmit={submit}>
          <p className="text-sm text-muted-foreground">Confirme sua identidade com a senha de login para assinar o termo do chamado #{ticket?.number}.</p>
          {equipmentTerm?.pdf_url && (
            <Button type="button" variant="outline" nativeButton={false} render={<a href={equipmentTerm.pdf_url} target="_blank" rel="noreferrer" />}>
              Visualizar PDF antes de assinar
            </Button>
          )}
          <Input type="password" placeholder="Sua senha" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <Input placeholder="Assinatura (opcional, usa seu nome)" value={signatureText} onChange={(e) => setSignatureText(e.target.value)} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={submitting}>{submitting ? <Loader2 className="animate-spin" /> : null}Confirmar assinatura</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
