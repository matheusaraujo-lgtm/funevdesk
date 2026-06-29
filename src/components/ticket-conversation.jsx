"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Headset,
  Lock,
  MessageSquare,
  Send,
  Shield,
  X,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RichTextContent } from "@/components/rich-text-content";
import { RichTextEditor } from "@/components/rich-text-editor";
import { isRichTextEmpty } from "@/lib/rich-text";
import { cn } from "@/lib/utils";

function initials(name = "?") {
  return name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase();
}

function formatRelativeTime(date) {
  const diffMs = Date.now() - new Date(date).getTime();
  const minutes = Math.max(1, Math.round(diffMs / 60000));
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `há ${days}d`;
  return new Date(date).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function formatFullTime(date) {
  return new Date(date).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function resolveMessageKind(message, requesterId) {
  if (message.kind === "opening") return "opening";
  if (message.message_type === "RESOLUTION") return "resolution";
  if (message.visibility === "INTERNAL") return "internal";
  if (message.author_id === requesterId) return "customer";
  if (message.kind === "system") return "system";
  return "agent";
}

function ConversationMessage({ message, requesterId, currentUserId, isLast, ticket }) {
  const kind = resolveMessageKind(message, requesterId);
  const isSelf = message.author_id && message.author_id === currentUserId;
  const isAgent = kind === "agent" || kind === "resolution";
  const isInternal = kind === "internal";
  const isResolution = kind === "resolution";
  const isSystem = kind === "system" || (kind === "opening" && ticket?.source === "MONITOR");

  return (
    <article
      className={cn(
        "px-3 py-2.5",
        isSystem && "border-l-[3px] border-red-400 bg-red-50/60",
        isInternal && "bg-amber-50/50",
        !isLast && "border-b border-border/60"
      )}
    >
      <div className="flex gap-2.5">
        <Avatar className="size-8 shrink-0">
          <AvatarFallback
            className={cn(
              "text-[10px] font-semibold",
              isSystem && "bg-red-100 text-red-700",
              isInternal && "bg-amber-100 text-amber-900",
              isAgent && "bg-primary text-primary-foreground",
              !isInternal && !isAgent && !isSystem && "bg-muted text-foreground"
            )}
          >
            {isSystem ? "S" : initials(message.author_name)}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <span className="text-[13px] font-semibold">{isSystem ? "Sistema" : message.author_name}</span>
            {isSelf && !isSystem && <span className="text-[11px] text-muted-foreground">· você</span>}
            {!isSystem && isAgent && !isResolution && (
              <Badge variant="outline" className="h-4 rounded-full px-1.5 text-[9px] font-normal">
                Suporte
              </Badge>
            )}
            {!isSystem && kind === "customer" && (
              <Badge variant="outline" className="h-4 rounded-full px-1.5 text-[9px] font-normal">
                Usuário
              </Badge>
            )}
            {isSystem && (
              <Badge variant="outline" className="h-4 gap-0.5 rounded-full border-red-200 bg-red-50 px-1.5 text-[9px] text-red-600">
                <AlertTriangle className="size-2.5" />
                Alerta
              </Badge>
            )}
            <time className="text-[11px] text-muted-foreground" dateTime={message.created_at} title={formatFullTime(message.created_at)}>
              {formatRelativeTime(message.created_at)}
            </time>
          </div>
          <RichTextContent value={message.body} className="mt-1.5 text-[13px] leading-relaxed" />
        </div>
      </div>
    </article>
  );
}

function EventRow({ event, isLast }) {
  return (
    <div className={cn("flex gap-2.5 px-4 py-3.5", !isLast && "border-b border-border/60")}>
      <div className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[13px] font-medium">{event.actor_name || "Sistema"}</p>
          <time className="text-[11px] text-muted-foreground">{formatFullTime(event.created_at)}</time>
        </div>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{event.description}</p>
      </div>
    </div>
  );
}

export function TicketConversation({
  ticket,
  messages = [],
  events = [],
  permissions,
  currentUserId,
  onSend,
  sending = false,
  isResolved: isResolvedProp,
}) {
  const [draft, setDraft] = useState("");
  const [composerMode, setComposerMode] = useState("PUBLIC");
  const [filter, setFilter] = useState("public");
  const bottomRef = useRef(null);

  const isResolved = isResolvedProp ?? ticket.status === "RESOLVIDO";
  const canManage = permissions?.canManageTickets;

  const thread = useMemo(() => {
    const opening = {
      id: `opening-${ticket.id}`,
      kind: ticket.source === "MONITOR" ? "system" : "opening",
      author_id: ticket.requester_id,
      author_name: ticket.source === "MONITOR" ? "Sistema" : ticket.requester_name || ticket.logged_user || "Solicitante",
      body: ticket.description,
      created_at: ticket.created_at,
      visibility: "PUBLIC",
    };
    return [opening, ...messages];
  }, [ticket, messages]);

  const publicThread = useMemo(
    () => thread.filter((item) => item.kind === "opening" || item.kind === "system" || item.visibility === "PUBLIC"),
    [thread]
  );
  const internalThread = useMemo(() => thread.filter((item) => item.visibility === "INTERNAL"), [thread]);

  useEffect(() => {
    if (filter !== "events") bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, filter]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (isRichTextEmpty(draft)) return;
    // Em chamado encerrado, só a equipe registra — e apenas como nota interna.
    if (isResolved && !canManage) return;
    const visibility = isResolved ? "INTERNAL" : (canManage ? composerMode : "PUBLIC");
    const ok = await onSend?.({ body: draft, visibility });
    if (ok !== false) setDraft("");
  }

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSubmit(event);
    }
  }

  return (
    <Card className="ticket-column rounded-2xl py-0 shadow-none">
      <CardHeader className="flex-row items-center justify-between space-y-0 border-b border-border/70 px-4 py-2.5">
        <Tabs value={filter} onValueChange={setFilter} className="gap-0">
          <TabsList className="h-8 bg-muted/70 p-0.5">
            <TabsTrigger value="public" className="h-7 px-2.5 text-xs data-active:bg-primary data-active:text-primary-foreground">
              Público ({publicThread.length})
            </TabsTrigger>
            {canManage && (
              <TabsTrigger value="internal" className="h-7 px-2.5 text-xs data-active:bg-primary data-active:text-primary-foreground">
                Interno ({internalThread.length})
              </TabsTrigger>
            )}
            <TabsTrigger value="events" className="h-7 px-2.5 text-xs data-active:bg-primary data-active:text-primary-foreground">
              Histórico ({events.length})
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>

      <CardContent className="min-h-0 flex-1 overflow-y-auto p-0">
        {filter === "events" ? (
          events.length ? (
            events.map((event, index) => <EventRow key={event.id} event={event} isLast={index === events.length - 1} />)
          ) : (
            <EmptyState message="Nenhum evento registrado" />
          )
        ) : filter === "internal" ? (
          internalThread.length ? (
            internalThread.map((item, index) => (
              <ConversationMessage
                key={item.id}
                message={item}
                requesterId={ticket.requester_id}
                currentUserId={currentUserId}
                isLast={index === internalThread.length - 1}
                ticket={ticket}
              />
            ))
          ) : (
            <EmptyState message="Sem notas internas" />
          )
        ) : publicThread.length ? (
          publicThread.map((item, index) => (
            <ConversationMessage
              key={item.id}
              message={item}
              requesterId={ticket.requester_id}
              currentUserId={currentUserId}
              isLast={index === publicThread.length - 1}
              ticket={ticket}
            />
          ))
        ) : (
          <EmptyState message="Sem mensagens públicas" />
        )}
        <div ref={bottomRef} />
      </CardContent>

      <CardFooter className="block border-t border-border/70 bg-muted/10 p-0">
        {isResolved && !canManage ? (
          <div className="flex items-center gap-2 px-4 py-3 text-[13px] text-muted-foreground">
            <Shield className="size-4" />
            Chamado encerrado — novas mensagens estão desabilitadas.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-2 p-3">
            {isResolved ? (
              <div className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700 ring-1 ring-amber-200">
                <Lock className="size-3" /> Chamado encerrado — registre apenas notas internas.
              </div>
            ) : canManage && (
              <div className="inline-flex rounded-md bg-background p-0.5 ring-1 ring-border/70">
                <button
                  type="button"
                  onClick={() => setComposerMode("PUBLIC")}
                  className={cn(
                    "inline-flex h-7 items-center gap-1 rounded px-2.5 text-[11px] font-medium",
                    composerMode === "PUBLIC" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                  )}
                >
                  <Headset className="size-3" />
                  Resposta pública
                </button>
                <button
                  type="button"
                  onClick={() => setComposerMode("INTERNAL")}
                  className={cn(
                    "inline-flex h-7 items-center gap-1 rounded px-2.5 text-[11px] font-medium",
                    composerMode === "INTERNAL" ? "bg-amber-600 text-white" : "text-muted-foreground"
                  )}
                >
                  <Lock className="size-3" />
                  Nota interna
                </button>
              </div>
            )}

            <div className="overflow-hidden rounded-lg bg-background ring-1 ring-border/80">
              <RichTextEditor
                value={draft}
                onChange={setDraft}
                onKeyDown={handleKeyDown}
                placeholder={isResolved ? "Adicionar nota interna ao chamado encerrado..." : "Digite sua resposta..."}
                minHeight="72px"
                className="rounded-none border-0 shadow-none"
                allowImages
                allowFiles
              />
              <div className="flex items-center justify-between gap-2 border-t border-border/60 px-3 py-2">
                <p className="text-[10px] text-muted-foreground">
                  {isResolved || (composerMode === "INTERNAL" && canManage) ? "Somente equipe" : "Visível ao solicitante e à equipe"}
                </p>
                <div className="flex items-center gap-1.5">
                  <Button type="button" variant="ghost" size="icon-sm" className="size-7 text-muted-foreground" onClick={() => setDraft("")} title="Limpar">
                    <X className="size-3.5" />
                  </Button>
                  <Button type="submit" size="sm" className="h-7 px-3 text-xs" disabled={sending || isRichTextEmpty(draft)}>
                    <Send className="size-3" />
                    {sending ? "Enviando..." : "Enviar"}
                  </Button>
                </div>
              </div>
            </div>
          </form>
        )}
      </CardFooter>
    </Card>
  );
}

function EmptyState({ message }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <MessageSquare className="mb-2 size-7 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
