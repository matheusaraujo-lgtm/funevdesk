"use client";

import { useState } from "react";
import { Sparkles, Loader2, ListChecks, AlertTriangle, Info } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const SEVERITY_STYLE = {
  Crítica: "border-red-200 bg-red-50 text-red-700",
  Alta: "border-amber-200 bg-amber-50 text-amber-700",
  Média: "border-blue-200 bg-blue-50 text-blue-700",
  Baixa: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

/**
 * Botão "Explicar / Como resolver" — chama o analista (motor de inteligência +
 * DeepSeek) sob demanda e mostra a explicação em linguagem simples num diálogo.
 */
export function TicketAnalystPanel({ ticketId }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [insight, setInsight] = useState(null);

  async function explain() {
    setOpen(true);
    if (insight) return; // já carregado nesta visualização
    setLoading(true);
    const response = await fetch(`/api/tickets/${ticketId}/explain`, { method: "POST" });
    const result = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) {
      setOpen(false);
      return toast.error(result.error || "Não foi possível gerar a explicação.");
    }
    setInsight(result.insight);
  }

  const severityStyle = insight ? SEVERITY_STYLE[insight.severityLabel] || SEVERITY_STYLE.Média : "";

  return (
    <>
      <Button variant="outline" size="sm" className="h-7 w-full text-xs" onClick={explain}>
        <Sparkles className="size-3 text-primary" /> Sugestão da IA
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Sparkles className="size-4 text-primary" /> Analista do FunevDesk
            </DialogTitle>
            <DialogDescription>
              Explicação em linguagem simples gerada pelo motor de inteligência.
            </DialogDescription>
          </DialogHeader>

          {loading && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Analisando o chamado...
            </div>
          )}

          {!loading && insight && (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold leading-snug">{insight.titulo}</h3>
                {insight.severityLabel && (
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${severityStyle}`}>
                    {insight.severityLabel}
                  </span>
                )}
              </div>

              <Section icon={Info} title="O que aconteceu">
                <p className="text-sm text-muted-foreground">{insight.resumo}</p>
              </Section>

              {insight.impacto && (
                <Section icon={AlertTriangle} title="Possível impacto" tone="text-amber-600">
                  <p className="text-sm text-muted-foreground">{insight.impacto}</p>
                </Section>
              )}

              {insight.acoes?.length > 0 && (
                <Section icon={ListChecks} title="O que fazer" tone="text-emerald-600">
                  <ol className="ml-1 space-y-1.5">
                    {insight.acoes.map((acao, index) => (
                      <li key={index} className="flex gap-2 text-sm text-muted-foreground">
                        <span className="font-semibold text-foreground">{index + 1}.</span>
                        <span>{acao}</span>
                      </li>
                    ))}
                  </ol>
                </Section>
              )}

              <p className="border-t pt-2 text-[10px] text-muted-foreground">
                {insight.source === "deepseek"
                  ? "Análise refinada por inteligência artificial."
                  : "Análise gerada pelo motor de regras. Ative a inteligência artificial nas configurações para análises mais detalhadas."}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Section({ icon: Icon, title, tone = "text-primary", children }) {
  return (
    <div>
      <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold">
        <Icon className={`size-3.5 ${tone}`} /> {title}
      </p>
      {children}
    </div>
  );
}
