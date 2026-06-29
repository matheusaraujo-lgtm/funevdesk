"use client";

import { useState } from "react";
import { CheckCircle2, Clock3, Download, Eye, FileCheck2, Flag, PenLine, UserCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { TicketTermPrepareDialog, TicketTermSignDialog } from "@/components/ticket-term-workflow";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// Cores por estado de etapa (segue o design system: feito=verde, ativo=amarelo, falhou=vermelho).
const STEP_TONE = {
  done: { dot: "border-emerald-500 bg-emerald-500 text-white", line: "bg-emerald-500", label: "text-emerald-700" },
  active: { dot: "border-amber-500 bg-amber-50 text-amber-700", line: "bg-border", label: "text-amber-700 font-medium" },
  failed: { dot: "border-destructive bg-destructive/10 text-destructive", line: "bg-border", label: "text-destructive font-medium" },
  upcoming: { dot: "border-border bg-muted/40 text-muted-foreground", line: "bg-border", label: "text-muted-foreground" },
};

function StepTimeline({ steps }) {
  return (
    <div className="flex items-start">
      {steps.map((step, index) => {
        const tone = STEP_TONE[step.status] || STEP_TONE.upcoming;
        const Icon = step.icon;
        return (
          <div key={step.key} className="flex flex-1 flex-col items-center">
            <div className="flex w-full items-center">
              <div className={cn("h-0.5 flex-1", index === 0 ? "bg-transparent" : tone.line)} />
              <div className={cn("flex size-7 shrink-0 items-center justify-center rounded-full border-2", tone.dot)}>
                {step.status === "done" ? <CheckCircle2 className="size-3.5" /> : Icon ? <Icon className="size-3.5" /> : <span className="text-[11px] font-medium">{step.num}</span>}
              </div>
              <div className={cn("h-0.5 flex-1", index === steps.length - 1 ? "bg-transparent" : (steps[index + 1]?.status === "done" || step.status === "done") ? "bg-emerald-500" : "bg-border")} />
            </div>
            <span className={cn("mt-1.5 text-center text-[11px] leading-tight", tone.label)}>{step.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export function TicketWorkflowSection({
  ticketId,
  ticket,
  assets = [],
  users = [],
  termTemplate,
  approvals = [],
  pendingApproval,
  equipmentTerm,
  requiresTerm,
  permissions,
  currentUserId,
  onReload,
}) {
  const [busy, setBusy] = useState("");
  const [comments, setComments] = useState({});
  const [prepareOpen, setPrepareOpen] = useState(false);
  const [signOpen, setSignOpen] = useState(false);

  if (!pendingApproval && !requiresTerm && !equipmentTerm && !approvals.length) return null;

  const pendingTerm = equipmentTerm?.status === "PENDENTE_ASSINATURA";
  const signedTerm = equipmentTerm?.status === "ASSINADO";
  const canPrepare = permissions?.canManageTickets && requiresTerm && !signedTerm;
  const canSign = pendingTerm && (equipmentTerm?.signer_user_id === currentUserId || !equipmentTerm?.signer_user_id);

  const hasApprovalFlow = approvals.length > 0 || Boolean(pendingApproval);
  const hasTermFlow = Boolean(requiresTerm || equipmentTerm);
  const approvalApproved = approvals.some((a) => a.status === "APROVADO");
  const approvalRejected = !approvalApproved && approvals.some((a) => a.status === "REPROVADO");

  // Monta a linha do tempo só com as etapas que este chamado realmente tem.
  const steps = [{ key: "open", label: "Abertura", num: 1, status: "done" }];
  if (hasApprovalFlow) {
    steps.push({ key: "approval", label: "Aprovação", icon: UserCheck, status: pendingApproval ? "active" : approvalRejected ? "failed" : "done" });
  }
  if (hasTermFlow) {
    steps.push({ key: "term", label: "Assinatura", icon: PenLine, status: signedTerm ? "done" : pendingApproval ? "upcoming" : "active" });
  }
  const allResolved = !pendingApproval && !approvalRejected && (hasTermFlow ? signedTerm : true);
  steps.push({ key: "done", label: "Conclusão", icon: Flag, status: allResolved ? "done" : "upcoming" });
  steps.forEach((s, i) => (s.num = i + 1));

  async function decideApproval(approvalId, status) {
    const comment = (comments[approvalId] || "").trim();
    if (status === "REPROVADO" && !comment) {
      return toast.error("Informe o motivo da reprovação para o solicitante.");
    }
    setBusy(approvalId);
    const response = await fetch(`/api/tickets/${ticketId}/approvals`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ approvalId, status, comment }),
    });
    const result = await response.json().catch(() => ({}));
    setBusy("");
    if (!response.ok) return toast.error(result.error || "Não foi possível registrar a aprovação.");
    toast.success(status === "APROVADO" ? "Chamado aprovado e atendimento liberado." : "Chamado reprovado.");
    onReload?.();
  }

  return (
    <>
      <div className="mb-4 rounded-2xl border-0 ring-1 ring-foreground/10 bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FileCheck2 className="size-4" />
          </div>
          <div>
            <p className="text-sm font-semibold leading-none">Fluxo do chamado</p>
            <p className="mt-1 text-xs text-muted-foreground">Acompanhe e execute as etapas obrigatórias.</p>
          </div>
        </div>

        <StepTimeline steps={steps} />

        {/* APROVAÇÕES */}
        {approvals.map((approval) => {
          const isPending = approval.status === "PENDENTE";
          const canDecide = isPending && (approval.approver_id === currentUserId || permissions?.canManageTickets);
          return (
            <div
              key={approval.id}
              className={cn(
                "rounded-lg border px-3 py-2.5",
                canDecide ? "border-amber-300 bg-amber-50/60 ring-1 ring-amber-200" : approval.status === "APROVADO" ? "border-emerald-200 bg-emerald-50/40" : approval.status === "REPROVADO" ? "border-destructive/30 bg-destructive/5" : "border-border bg-muted/20",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <UserCheck className="size-3.5 text-muted-foreground" />
                  <p className="text-xs font-medium">{approval.approver_name}</p>
                </div>
                <Badge variant={approval.status === "APROVADO" ? "success" : approval.status === "REPROVADO" ? "destructive" : "warning"} className="h-5 text-[10px]">
                  {approval.status}
                </Badge>
              </div>

              {canDecide ? (
                <div className="mt-2.5 space-y-2">
                  <p className="text-[11px] text-amber-800">Você é o aprovador. Atendimento e SLA ficam pausados até a decisão.</p>
                  <Textarea
                    value={comments[approval.id] || ""}
                    onChange={(e) => setComments((prev) => ({ ...prev, [approval.id]: e.target.value }))}
                    placeholder="Comentário (obrigatório ao reprovar, opcional ao aprovar)"
                    className="min-h-[52px] text-xs"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="h-8 flex-1 border-destructive/40 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={Boolean(busy)} onClick={() => decideApproval(approval.id, "REPROVADO")}>
                      <XCircle className="size-3.5" /> Reprovar
                    </Button>
                    <Button size="sm" className="h-8 flex-[1.6] bg-emerald-600 text-xs text-white hover:bg-emerald-700" disabled={Boolean(busy)} onClick={() => decideApproval(approval.id, "APROVADO")}>
                      <CheckCircle2 className="size-3.5" /> Aprovar e liberar
                    </Button>
                  </div>
                </div>
              ) : approval.comment ? (
                <p className="mt-1.5 text-[11px] text-muted-foreground">“{approval.comment}”</p>
              ) : null}
            </div>
          );
        })}

        {pendingApproval && !approvals.some((a) => a.status === "PENDENTE" && (a.approver_id === currentUserId || permissions?.canManageTickets)) && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
            <Clock3 className="mt-0.5 size-3.5 shrink-0" />
            <span>Aguardando aprovação de <span className="font-medium">{pendingApproval.approver_name}</span>. O atendimento continua quando a decisão for registrada.</span>
          </div>
        )}

        {/* TERMO */}
        {(requiresTerm || equipmentTerm) && (
          <div className={cn("rounded-lg border px-3 py-2.5", signedTerm ? "border-emerald-200 bg-emerald-50/40" : pendingTerm ? "border-amber-300 bg-amber-50/60" : pendingApproval ? "border-border bg-muted/20" : "border-primary/20 bg-primary/5")}>
            <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold">
              <FileCheck2 className="size-3.5 text-primary" />
              Termo de equipamento
              {pendingTerm && <Badge variant="warning" className="h-5 text-[10px]">Aguardando assinatura</Badge>}
              {signedTerm && <Badge variant="success" className="h-5 text-[10px]">Assinado</Badge>}
              {!equipmentTerm && pendingApproval && <Badge variant="muted" className="h-5 text-[10px]">Após aprovação</Badge>}
            </div>

            {signedTerm ? (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted-foreground">Assinado por <span className="font-medium text-foreground">{equipmentTerm.signer_name}</span></span>
                <Button variant="outline" size="sm" className="ml-auto h-7 text-xs" nativeButton={false} render={<a href={equipmentTerm.pdf_url} target="_blank" rel="noreferrer" />}>
                  <Download className="size-3" /> Baixar PDF
                </Button>
              </div>
            ) : pendingTerm ? (
              <div className="space-y-2">
                <p className="text-[11px] text-muted-foreground">
                  {canSign ? "Revise o documento e assine com sua senha de login." : "Aguardando a assinatura do usuário responsável."}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" className="h-7 text-xs" nativeButton={false} render={<a href={equipmentTerm.pdf_url} target="_blank" rel="noreferrer" />}>
                    <Eye className="size-3" /> Pré-visualizar
                  </Button>
                  {canSign && (
                    <Button size="sm" className="h-7 text-xs" onClick={() => setSignOpen(true)}>
                      <PenLine className="size-3" /> Assinar termo
                    </Button>
                  )}
                  {canPrepare && (
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setPrepareOpen(true)}>Reeditar</Button>
                  )}
                </div>
              </div>
            ) : canPrepare ? (
              <div className="space-y-1.5">
                <p className="text-[11px] text-muted-foreground">Prepare o termo a partir do modelo e envie para o usuário assinar.</p>
                <Button size="sm" className="h-7 text-xs" disabled={Boolean(pendingApproval)} onClick={() => setPrepareOpen(true)}>
                  <PenLine className="size-3" /> Preparar termo
                </Button>
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">O técnico preparará o termo e enviará para assinatura.</p>
            )}
          </div>
        )}
      </div>

      {canPrepare && (
        <TicketTermPrepareDialog
          open={prepareOpen}
          onOpenChange={setPrepareOpen}
          ticket={ticket}
          assets={assets}
          users={users}
          template={termTemplate}
          equipmentTerm={equipmentTerm}
          onPrepared={() => onReload?.()}
        />
      )}
      {canSign && (
        <TicketTermSignDialog
          open={signOpen}
          onOpenChange={setSignOpen}
          ticket={ticket}
          equipmentTerm={equipmentTerm}
          onSigned={() => onReload?.()}
        />
      )}
    </>
  );
}
