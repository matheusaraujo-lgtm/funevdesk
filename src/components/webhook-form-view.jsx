"use client";

import { useEffect, useState } from "react";
import { Webhook } from "lucide-react";
import { toast } from "sonner";
import { CrudFormLayout } from "@/components/crud-form-layout";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { eventLabel } from "@/components/webhook-events";

const eventOptions = ["TICKET_NEW", "TICKET_RESOLVED", "TICKET_ASSIGNED", "TICKET_MESSAGE", "CHANGE_CREATED", "PROBLEM_CREATED"];

export function WebhookFormView({ hook, onCancel, onSaved }) {
  const isEdit = Boolean(hook?.id);
  const [form, setForm] = useState({ name: "", url: "", secret: "", events: ["TICKET_NEW"] });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Ressincroniza o formulário quando o webhook editado muda.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm(hook
      ? { name: hook.name || "", url: hook.url || "", secret: "", events: hook.events?.length ? hook.events : ["TICKET_NEW"] }
      : { name: "", url: "", secret: "", events: ["TICKET_NEW"] });
  }, [hook]);

  function toggleEvent(event) {
    setForm((current) => ({
      ...current,
      events: current.events.includes(event) ? current.events.filter((e) => e !== event) : [...current.events, event],
    }));
  }

  async function submit(event) {
    event.preventDefault();
    if (!form.name.trim() || !form.url.trim() || !form.events.length) return toast.error("Preencha nome, URL e ao menos um evento.");
    setSubmitting(true);
    const payload = { name: form.name.trim(), url: form.url.trim(), events: form.events };
    const response = await fetch(isEdit ? `/api/webhooks/${hook.id}` : "/api/webhooks", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(isEdit ? payload : form),
    });
    const result = await response.json();
    setSubmitting(false);
    if (!response.ok) return toast.error(result.error || `Não foi possível ${isEdit ? "salvar" : "criar"} o webhook.`);
    toast.success(isEdit ? "Webhook atualizado." : "Webhook criado.");
    onSaved?.();
    onCancel();
  }

  return <CrudFormLayout
    title={isEdit ? "Editar webhook" : "Novo webhook"}
    description="Receba eventos do FunevDesk em sistemas externos."
    onCancel={onCancel}
    onSubmit={submit}
    submitLabel={isEdit ? "Salvar alterações" : "Criar webhook"}
    submitting={submitting}
    icon={Webhook}>
    <div className="sm:col-span-2"><p className="mb-2 text-sm font-medium">Nome</p><Input value={form.name} onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))} /></div>
    <div className="sm:col-span-2"><p className="mb-2 text-sm font-medium">URL de destino</p><Input type="url" value={form.url} onChange={(e) => setForm((c) => ({ ...c, url: e.target.value }))} placeholder="https://..." /></div>
    {!isEdit && <div className="sm:col-span-2"><p className="mb-2 text-sm font-medium">Segredo (opcional)</p><Input value={form.secret} onChange={(e) => setForm((c) => ({ ...c, secret: e.target.value }))} /></div>}
    <div className="sm:col-span-2"><p className="mb-2 text-sm font-medium">Eventos</p><div className="grid gap-2 sm:grid-cols-2">{eventOptions.map((event) => <label key={event} className="flex items-center gap-2 rounded-lg border p-3 text-sm"><Checkbox checked={form.events.includes(event)} onCheckedChange={() => toggleEvent(event)} />{eventLabel(event)}</label>)}</div></div>
  </CrudFormLayout>;
}
