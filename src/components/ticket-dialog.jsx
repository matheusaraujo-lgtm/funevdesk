"use client";

import { useMemo, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { TicketConfiguredFieldInput, TicketFormField } from "@/components/ticket-configured-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const Field = TicketFormField;

export function TicketDialog({ open, setOpen, branches, assets, defaultBranchId, onCreate, currentUser, permissions, catalog, demoUser }) {
  const [ticketTypeId, setTicketTypeId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [assetId, setAssetId] = useState("none");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [answers, setAnswers] = useState({});
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const selectedBranchId = branchId || defaultBranchId || branches[0]?.id || "";
  const selectedBranch = branches.find((branch) => branch.id === selectedBranchId);
  const selectedType = useMemo(() => catalog.find((type) => type.id === ticketTypeId) || catalog[0], [catalog, ticketTypeId]);
  const selectedAsset = assets.find((asset) => asset.id === assetId);

  function reset() {
    setTicketTypeId("");
    setBranchId("");
    setAssetId("none");
    setTitle("");
    setDescription("");
    setAnswers({});
    setAttachments([]);
  }

  async function uploadFile(field, file) {
    if (!file) return;
    setUploading(true);
    const body = new FormData();
    body.append("arquivo", file);
    const response = await fetch("/api/uploads", { method: "POST", headers: { "x-usuario-demonstracao": demoUser }, body });
    const result = await response.json();
    setUploading(false);
    if (!response.ok) return toast.error(result.error);
    setAttachments((current) => [...current.filter((item) => item.fieldId !== field.id), {
      ...result, fieldId: field.id, fieldLabel: field.label, attachmentType: field.field_type,
    }]);
    toast.success("Arquivo anexado.");
  }

  async function submit(event) {
    event.preventDefault();
    if (!selectedType) return toast.error("Selecione um tipo de chamado.");
    await onCreate({
      branchId: selectedBranchId,
      assetId: currentUser.role === "EMPLOYEE" ? assets[0]?.id || null : assetId === "none" ? null : assetId,
      ticketTypeId: selectedType.id,
      title,
      description,
      answers: selectedType.fields.filter((field) => !["FILE", "SCREENSHOT"].includes(field.field_type)).map((field) => ({ fieldId: field.id, value: answers[field.id] || "" })),
      attachments,
    });
    reset();
  }

  function renderConfiguredField(field) {
    return (
      <TicketConfiguredFieldInput
        field={field}
        value={answers[field.id] || ""}
        onChange={(next) => setAnswers((current) => ({ ...current, [field.id]: next }))}
        attachment={attachments.find((item) => item.fieldId === field.id)}
        onUpload={uploadFile}
        uploading={uploading}
      />
    );
  }

  return <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) reset(); }}><DialogContent className="sm:max-w-[720px]"><form onSubmit={submit}><DialogHeader><DialogTitle>Abrir novo chamado</DialogTitle><DialogDescription>O formulário muda conforme o tipo de atendimento escolhido.</DialogDescription></DialogHeader>
    <ScrollArea className="max-h-[68vh] pr-4"><div className="grid gap-4 py-5 sm:grid-cols-2">
      <Field label="Tipo de chamado" required className="sm:col-span-2"><Select value={selectedType?.id || ""} onValueChange={(value) => { setTicketTypeId(value); setAnswers({}); setAttachments([]); }}><SelectTrigger><SelectValue placeholder="Selecione o tipo">{(value) => catalog.find((type) => type.id === value)?.name}</SelectValue></SelectTrigger><SelectContent>{catalog.filter((type) => type.active).map((type) => <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>)}</SelectContent></Select>{selectedType && <p className="mt-2 text-xs text-muted-foreground">{selectedType.description}</p>}</Field>
      <Field label="Unidade">{permissions.canViewAllBranches ? <Select value={selectedBranchId} onValueChange={(value) => { setBranchId(value); setAssetId("none"); }}><SelectTrigger><SelectValue placeholder="Selecione a unidade">{(value) => branches.find((branch) => branch.id === value)?.name}</SelectValue></SelectTrigger><SelectContent>{branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}</SelectContent></Select> : <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">{currentUser.branchName}</div>}</Field>
      <Field label={currentUser.role === "EMPLOYEE" ? "Máquina detectada" : "Equipamento"}>{currentUser.role === "EMPLOYEE" ? <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">{assets[0] ? `${assets[0].hostname} · ${assets[0].logged_user}` : "Nenhuma máquina associada"}</div> : <Select value={assetId} onValueChange={setAssetId}><SelectTrigger><SelectValue placeholder="Nenhum">{(value) => value === "none" ? "Nenhum" : assets.find((asset) => asset.id === value)?.hostname}</SelectValue></SelectTrigger><SelectContent><SelectItem value="none">Nenhum</SelectItem>{assets.filter((asset) => asset.branch_id === selectedBranchId).map((asset) => <SelectItem key={asset.id} value={asset.id}>{asset.hostname} · {asset.logged_user}</SelectItem>)}</SelectContent></Select>}</Field>
      <Field label="Título" required className="sm:col-span-2"><Input required minLength={5} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Resuma o problema ou solicitação" /></Field>
      <Field label="Descrição geral" required className="sm:col-span-2"><Textarea required minLength={5} rows={4} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Conte o que aconteceu e como isso afeta seu trabalho" /></Field>
      {selectedType?.fields.map((field) => <Field key={field.id} label={field.label} required={field.required} className="sm:col-span-2">{renderConfiguredField(field)}</Field>)}
    </div></ScrollArea>
    <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit" disabled={uploading}>{uploading && <LoaderCircle className="animate-spin" />}{uploading ? "Enviando arquivo..." : "Criar chamado"}</Button></DialogFooter>
  </form></DialogContent></Dialog>;
}
