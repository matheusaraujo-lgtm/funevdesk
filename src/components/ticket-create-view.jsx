"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AppWindow, ArrowLeft, Building2, Check, FileCheck2, FileUp, Info, KeyRound,
  Laptop2, LoaderCircle, Mail, Monitor, Printer, Search, Send, Ticket, Wifi
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TicketConfiguredFieldInput, TicketFormField } from "@/components/ticket-configured-field";
import { RichTextEditor } from "@/components/rich-text-editor";
import { isRichTextEmpty } from "@/lib/rich-text";
import { cn } from "@/lib/utils";

const Field = TicketFormField;

// Ícone do card de tipo, derivado por palavras-chave do nome/categoria — torna a
// escolha do atendimento mais visual (padrão "request catalog" do Jira/ServiceNow).
// Retorna o elemento já pronto para evitar criar um componente durante o render.
function typeIcon(option, className = "size-[18px]") {
  const text = `${option.label} ${option.description || ""}`.toLowerCase();
  if (/impress|toner|papel|scanner/.test(text)) return <Printer className={className} />;
  if (/rede|internet|wi-?fi|vpn|conex|link/.test(text)) return <Wifi className={className} />;
  if (/acesso|senha|login|usuári|conta|permiss/.test(text)) return <KeyRound className={className} />;
  if (/equipa|máquin|maquin|notebook|computad|hardware|monitor|perif/.test(text)) return <Laptop2 className={className} />;
  if (/sistema|software|app|aplica|programa|erp/.test(text)) return <AppWindow className={className} />;
  if (/e-?mail|correio|outlook/.test(text)) return <Mail className={className} />;
  return <Ticket className={className} />;
}

// Cabeçalho de etapa: número em "badge" (vira check quando concluída) + título e dica.
// Dá sensação de progresso guiado, como Linear/JSM.
function StepCard({ step, title, hint, complete, children, className = "" }) {
  return (
    <Card className={cn("gap-0 rounded-2xl border-0 py-0 shadow-none ring-1 ring-foreground/10", className)}>
      <CardHeader className="border-b px-5 py-4">
        <div className="flex items-start gap-3">
          <span className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-colors",
            complete ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
          )}>
            {complete ? <Check className="size-4" /> : step}
          </span>
          <div className="min-w-0">
            <CardTitle className="text-[15px]">{title}</CardTitle>
            {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
          </div>
        </div>
      </CardHeader>
      {children}
    </Card>
  );
}

// Card clicável de tipo de chamado (substitui o select por uma grade visual).
function TypeCard({ option, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(option.value)}
      aria-pressed={selected}
      className={cn(
        "flex items-start gap-3 rounded-xl border p-4 text-left transition",
        selected
          ? "border-primary bg-primary/[0.06] ring-1 ring-primary"
          : "border-foreground/10 bg-card hover:border-primary/40 hover:bg-primary/[0.03]"
      )}
    >
      <span className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors",
        selected ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
      )}>
        {typeIcon(option)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{option.label}</span>
        {option.description && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{option.description}</span>}
      </span>
      {selected && <Check className="mt-0.5 size-4 shrink-0 text-primary" />}
    </button>
  );
}

// Chip de contexto detectado automaticamente (unidade, máquina, fila).
function ContextChip({ icon: Icon, value, muted }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
      muted ? "border-foreground/10 text-muted-foreground" : "border-primary/20 bg-primary/[0.05] text-foreground"
    )}>
      <Icon className={cn("size-3.5", muted ? "text-muted-foreground" : "text-primary")} />
      <span className="max-w-[180px] truncate">{value}</span>
    </span>
  );
}

export function TicketCreateView({
  branches, assets = [], users = [], defaultBranchId, onCreate, onCancel, currentUser, catalog,
}) {
  const [ticketTypeId, setTicketTypeId] = useState("");
  const [typeSearch, setTypeSearch] = useState("");
  const [branchId, setBranchId] = useState("");
  const [assetId, setAssetId] = useState("none");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState({});
  const [approverId, setApproverId] = useState("none");
  const [termSignerName, setTermSignerName] = useState(() => currentUser.name || "");
  const [termSignerDocument, setTermSignerDocument] = useState("");
  const [termSignature, setTermSignature] = useState("");
  const [termTemplate, setTermTemplate] = useState(null);
  const [answers, setAnswers] = useState({});
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [agentMachine, setAgentMachine] = useState(null);
  const [locationId, setLocationId] = useState("");
  const [locations, setLocations] = useState([]);
  // Trava síncrona contra duplo-submit: o estado `submitting` re-renderiza tarde demais
  // para barrar um 2º clique disparado no mesmo tick. A ref barra imediatamente.
  const submitLockRef = useRef(false);
  const selectedBranchId = branchId || defaultBranchId || branches[0]?.id || "";
  const selectedBranch = branches.find((branch) => branch.id === selectedBranchId);
  const ticketTypeOptions = useMemo(
    () => catalog
      .filter((type) => type.active && (type.allBranches || (type.branchIds || []).includes(selectedBranchId)))
      .map((type) => ({ value: type.id, label: type.name, description: type.category })),
    [catalog, selectedBranchId]
  );
  const filteredTypeOptions = useMemo(() => {
    const term = typeSearch.trim().toLowerCase();
    if (!term) return ticketTypeOptions;
    return ticketTypeOptions.filter((option) =>
      `${option.label} ${option.description || ""}`.toLowerCase().includes(term)
    );
  }, [ticketTypeOptions, typeSearch]);
  const selectedType = useMemo(() => catalog.find((type) => type.id === ticketTypeId) || null, [catalog, ticketTypeId]);
  const equipmentRequired = Boolean(selectedType?.requiresTerm);
  // Máquina vem SEMPRE da detecção automática do agente local (seta agentMachine/assetId).
  // Fallback para a máquina do próprio usuário (perfil colaborador).
  const detectedMachineName = agentMachine
    || (assetId && assetId !== "none" ? assets.find((asset) => asset.id === assetId)?.hostname : null)
    || (currentUser.role === "EMPLOYEE" ? assets[0]?.hostname : null)
    || null;
  const handlingBranchName = useMemo(() => {
    if (!selectedType || !selectedBranch) return selectedBranch?.name || currentUser.branchName;
    if (selectedType.targetBranchMode === "MATRIZ") {
      return branches.find((branch) => branch.type === "MATRIZ")?.name || "Matriz";
    }
    if (selectedType.targetBranchMode === "SPECIFIC" && selectedType.targetBranchId) {
      return branches.find((branch) => branch.id === selectedType.targetBranchId)?.name || selectedType.targetBranchName || "Unidade configurada";
    }
    return selectedBranch.name;
  }, [selectedType, selectedBranch, branches, currentUser.branchName]);
  const routedToOtherBranch = selectedType && selectedBranch && handlingBranchName && handlingBranchName !== selectedBranch.name;

  function changeTicketType(value) {
    setTicketTypeId(value);
    setAnswers({});
    setAttachments([]);
    setApproverId("none");
    setTermSignature("");
  }

  // Mantém os ativos atuais acessíveis ao probe sem reiniciá-lo a cada novo array de assets
  // (antes a dependência [assets] reiniciava a sondagem e disparava dezenas de requisições).
  const assetsRef = useRef(assets);
  useEffect(() => { assetsRef.current = assets; }, [assets]);

  useEffect(() => {
    let ignore = false;
    let attempts = 0;
    let timer;
    // Sonda o agente local algumas vezes (ele pode demorar a responder / a página pode
    // abrir antes do agente). Para assim que detecta a máquina. Roda uma única vez na montagem.
    async function probeAgent() {
      attempts += 1;
      let detected = false;
      try {
        const controller = new AbortController();
        // A ponte local coleta dados do sistema antes de responder (pode levar ~1-2,5s).
        // Timeout generoso para não abortar antes de a máquina ser detectada.
        const abortTimer = window.setTimeout(() => controller.abort(), 4000);
        const response = await fetch("http://127.0.0.1:47832/api/local", { signal: controller.signal, cache: "no-store" });
        window.clearTimeout(abortTimer);
        if (response.ok) {
          const data = await response.json();
          if (!ignore && data?.ok) {
            // Casa por assetId (rápido) ou por hostname (case-insensitive) e vincula sozinho.
            const currentAssets = assetsRef.current;
            const match = currentAssets.find((asset) => asset.id === data.assetId)
              || (data.hostname && currentAssets.find((asset) => asset.hostname?.toLowerCase() === data.hostname.toLowerCase()));
            if (data.assetId) {
              // A ponte já devolve o assetId/branchId resolvidos pelo servidor — vincula direto,
              // inclusive quando o usuário não tem a lista de ativos (perfil EMPLOYEE) e não há match local.
              setAssetId(data.assetId);
              if (data.branchId) setBranchId(data.branchId);
              setAgentMachine(data.hostname || match?.hostname || "");
              detected = true;
            } else if (match) {
              setAssetId(match.id);
              setBranchId(match.branch_id);
              setAgentMachine(data.hostname || match.hostname);
              detected = true;
            } else if (data.hostname) {
              setAgentMachine(data.hostname);
              detected = true;
            }
          }
        }
      } catch {
        // agente local ainda indisponível — tentaremos de novo
      }
      if (!ignore && !detected && attempts < 6) {
        timer = window.setTimeout(probeAgent, 500);
      }
    }
    timer = window.setTimeout(probeAgent, 50);
    return () => {
      ignore = true;
      window.clearTimeout(timer);
    };
    // Sondagem única na montagem; os ativos são lidos via assetsRef para não reiniciar o probe.
  }, []);

  useEffect(() => {
    if (!selectedBranchId) return;
    fetch(`/api/locations?branchId=${encodeURIComponent(selectedBranchId)}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return;
        const data = await response.json();
        setLocations(data.locations || []);
        setLocationId("");
      })
      .catch(() => setLocations([]));
  }, [selectedBranchId]);

  useEffect(() => {
    if (!ticketTypeId) return;
    if (!ticketTypeOptions.some((option) => option.value === ticketTypeId)) {
      // Limpa a seleção quando o tipo escolhido deixa de existir nas opções.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTicketTypeId("");
    }
  }, [ticketTypeId, ticketTypeOptions]);

  useEffect(() => {
    if (!selectedType?.requiresTerm || !selectedType.termTemplateId) {
      // Sem termo exigido: zera o template carregado.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTermTemplate(null);
      return;
    }
    fetch("/api/term-templates", { cache: "no-store" }).then(async (r) => {
      if (!r.ok) return;
      const template = (await r.json()).templates.find((t) => t.id === selectedType.termTemplateId);
      setTermTemplate(template || null);
    });
  }, [selectedType]);

  async function uploadFile(field, file) {
    if (!file) return;
    setUploading(true);
    const body = new FormData();
    body.append("arquivo", file);
    const response = await fetch("/api/uploads", { method: "POST", body });
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
    if (submitLockRef.current) return; // 2º clique no mesmo tick: ignora.
    if (!selectedType) return toast.error("Selecione um tipo de chamado.");
    const nextErrors = {};
    if (title.trim().length < 5) nextErrors.title = "Escreva um título com pelo menos 5 caracteres.";
    if (isRichTextEmpty(description)) nextErrors.description = "Descreva o que está acontecendo.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      toast.error("Revise os campos destacados antes de continuar.");
      return;
    }
    // Prioriza a máquina detectada/selecionada (vínculo automático pelo agente); fallback p/ a do usuário.
    const resolvedAssetId = assetId && assetId !== "none"
      ? assetId
      : (currentUser.role === "EMPLOYEE" ? assets[0]?.id || null : null);
    if (selectedType.requiresTerm && !resolvedAssetId) return toast.error("Nenhuma máquina detectada. Instale o agente nesta máquina para abrir um chamado que exige termo de equipamento.");
    if (selectedType.requiresApproval && selectedType.approvalMode === "SELECT" && approverId === "none") {
      return toast.error("Selecione o aprovador exigido por este tipo de chamado.");
    }
    submitLockRef.current = true; // trava ANTES do 1º await, barrando duplo-submit.
    setSubmitting(true);
    let created;
    try {
      created = await onCreate({
        branchId: selectedBranchId,
        assetId: resolvedAssetId,
        locationId: locationId || null,
        ticketTypeId: selectedType.id,
        title,
        description,
        approverId: approverId === "none" ? null : approverId,
        term: null,
        answers: selectedType.fields.filter((field) => !["FILE", "SCREENSHOT"].includes(field.field_type)).map((field) => ({ fieldId: field.id, value: answers[field.id] || "" })),
        attachments,
      });
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
    if (created) onCancel();
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
        branchId={selectedBranchId}
      />
    );
  }

  const submitting_ = uploading || submitting;
  const submitLabel = uploading ? "Enviando arquivo..." : submitting ? "Criando chamado..." : "Abrir chamado";

  return <form className="mx-auto max-w-7xl space-y-4 pb-6" onSubmit={submit}>
    {/* Header em destaque, enxuto: as ações principais agora vivem na barra fixa do rodapé. */}
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/[0.07] via-card to-secondary/25 px-5 py-5 ring-1 ring-foreground/10 sm:px-6">
      <div className="flex items-start gap-3.5">
        {currentUser.role !== "EMPLOYEE" && <Button type="button" variant="outline" size="icon" className="mt-0.5 bg-card/70" onClick={onCancel} aria-label="Voltar para chamados"><ArrowLeft /></Button>}
        <span className="hidden size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm sm:flex"><Ticket className="size-5" /></span>
        <div>
          <h1 className="page-title text-[26px]">Abrir chamado</h1>
          <p className="page-copy max-w-md">Diga o que você precisa e cuidamos do resto. O formulário se adapta ao tipo escolhido.</p>
        </div>
      </div>
    </div>

    {/* Contexto detectado automaticamente — vira informação leve, não campos a preencher. */}
    <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-card px-4 py-3 ring-1 ring-foreground/10">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Detectado automaticamente</span>
      <ContextChip icon={Building2} value={selectedBranch?.name || currentUser.branchName || "Sua unidade"} />
      <ContextChip icon={Monitor} value={detectedMachineName || "Nenhuma máquina"} muted={!detectedMachineName} />
      {routedToOtherBranch && <ContextChip icon={Building2} value={`Atendimento: ${handlingBranchName}`} />}
    </div>

    {/* Passo 1 — escolha do tipo em cards (sempre visível). */}
    <StepCard
      step={1}
      title="Do que você precisa?"
      hint="Escolha o tipo de atendimento."
      complete={Boolean(selectedType)}
      className="bg-gradient-to-br from-primary/[0.04] to-card ring-primary/15"
    >
      <CardContent className="px-5 py-5">
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            value={typeSearch}
            onChange={(event) => setTypeSearch(event.target.value)}
            placeholder="Buscar tipo de chamado..."
            className="bg-background pl-9"
          />
        </div>
        {filteredTypeOptions.length === 0 ? (
          <p className="rounded-lg border border-dashed bg-muted/20 px-3 py-6 text-center text-sm text-muted-foreground">
            {ticketTypeOptions.length === 0 ? "Nenhum tipo de chamado disponível." : "Nenhum tipo encontrado para a sua busca."}
          </p>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {filteredTypeOptions.map((option) => (
              <TypeCard key={option.value} option={option} selected={option.value === ticketTypeId} onSelect={changeTicketType} />
            ))}
          </div>
        )}
        {selectedType?.description && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-primary/15 bg-primary/[0.04] px-3 py-2.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0 text-primary" />
            <span>{selectedType.description}</span>
          </div>
        )}
      </CardContent>
    </StepCard>

    {/* Aviso de máquina exigida — destacado assim que o tipo é escolhido. */}
    {selectedType && equipmentRequired && !detectedMachineName && (
      <div className="flex items-start gap-2.5 rounded-2xl border border-amber-500/40 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <Monitor className="mt-0.5 size-4 shrink-0" />
        <span>Este tipo exige equipamento. Instale o agente nesta máquina para que ela seja detectada e vinculada automaticamente.</span>
      </div>
    )}

    {/* Passos seguintes só aparecem após escolher o tipo (progressive disclosure). */}
    {selectedType && (
      <>
        <StepCard step={2} title="Conte o que está acontecendo" hint="Quanto mais detalhes, mais rápido o suporte resolve.">
          <CardContent className="grid gap-5 px-5 py-5 sm:grid-cols-2">
            <Field label="Título" required className="sm:col-span-2">
              <Input value={title} aria-invalid={errors.title ? true : undefined} onChange={(event) => { setTitle(event.target.value); if (errors.title) setErrors((prev) => ({ ...prev, title: undefined })); }} placeholder="Resuma o problema em uma frase" />
              {errors.title && <p className="mt-1.5 text-xs text-destructive">{errors.title}</p>}
            </Field>
            <Field label="Descrição" required className="sm:col-span-2">
              <RichTextEditor value={description} onChange={(value) => { setDescription(value); if (errors.description) setErrors((prev) => ({ ...prev, description: undefined })); }} minHeight="120px" placeholder="O que aconteceu? Quando começou? Como isso afeta seu trabalho?" />
              {errors.description && <p className="mt-1.5 text-xs text-destructive">{errors.description}</p>}
            </Field>
            {locations.length > 0 && (
              <Field label="Localização">
                <Select value={locationId || "none"} onValueChange={(value) => setLocationId(value === "none" ? "" : value)}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Selecione o local">{(value) => value === "none" ? "Selecione o local" : locations.find((loc) => loc.id === value)?.name}</SelectValue></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Selecione…</SelectItem>
                    {locations.map((loc) => <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            )}
            {selectedType.requiresApproval && selectedType.approvalMode === "SELECT" && (
              <Field label="Aprovador" required className="sm:col-span-2">
                <Select value={approverId} onValueChange={setApproverId}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Selecione o aprovador">{(value) => value === "none" ? "Selecione o aprovador" : users.find((user) => user.id === value)?.name}</SelectValue></SelectTrigger>
                  <SelectContent><SelectItem value="none">Selecione...</SelectItem>{users.filter((user) => user.id !== currentUser.id && user.role !== "EMPLOYEE").map((user) => <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>)}</SelectContent>
                </Select>
                <p className="mt-2 text-xs text-muted-foreground">Este tipo exige aprovação antes do atendimento.</p>
              </Field>
            )}
            {selectedType.requiresApproval && selectedType.approvalMode === "FIXED" && (
              <Field label="Aprovação" className="sm:col-span-2"><div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">Aprovação automática para: <strong>{users.find((u) => u.id === selectedType.defaultApproverId)?.name || "Aprovador configurado"}</strong></div></Field>
            )}
          </CardContent>
        </StepCard>

        {selectedType.fields.length > 0 && (
          <StepCard step={3} title="Detalhes para o suporte" hint={`Campos específicos de ${selectedType.name}.`}>
            <CardContent className="grid gap-5 px-5 py-5 sm:grid-cols-2">{selectedType.fields.map((field) => <Field key={field.id} label={field.label} required={field.required} className={["TEXTAREA", "FILE", "SCREENSHOT", "STOCK", "MULTISELECT"].includes(field.field_type) ? "sm:col-span-2" : ""}>{renderConfiguredField(field)}</Field>)}</CardContent>
          </StepCard>
        )}

        {selectedType.requiresTerm && (
          <div className="flex gap-3 rounded-2xl border border-primary/15 bg-primary/[0.04] px-4 py-3.5 text-sm text-muted-foreground ring-1 ring-primary/10">
            <FileCheck2 className="size-5 shrink-0 text-primary" />
            <p className="leading-relaxed"><strong className="text-foreground">Termo de equipamento:</strong> após abrir o chamado, o técnico prepara o termo, escolhe quem assina e envia a notificação. A assinatura é confirmada com a senha do usuário.</p>
          </div>
        )}
      </>
    )}

    {/* Barra de ação fixa no rodapé — ação primária sempre ao alcance (padrão Front/Linear). */}
    <div className="sticky bottom-0 z-10 flex items-center gap-3 rounded-2xl border-0 bg-card/95 px-4 py-3 ring-1 ring-foreground/10 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <p className="hidden min-w-0 flex-1 truncate text-xs text-muted-foreground sm:block">
        {selectedType
          ? <span className="inline-flex items-center gap-1.5"><Ticket className="size-3.5 text-primary" />{selectedType.name} · <FileUp className="size-3.5" />{attachments.length} anexo(s)</span>
          : "Selecione um tipo de chamado para começar"}
      </p>
      <div className="ml-auto flex gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" disabled={!selectedType || submitting_}>
          {submitting_ ? <LoaderCircle className="animate-spin" /> : <Send />}
          {submitLabel}
        </Button>
      </div>
    </div>
  </form>;
}
