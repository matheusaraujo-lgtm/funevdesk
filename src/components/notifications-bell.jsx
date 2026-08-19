"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, Check, CheckCircle2, FileCheck2, KeyRound, MessageSquare, ShieldAlert, ShieldCheck, Ticket, UserCheck, XCircle } from "lucide-react";
import { timeAgo } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

// Ícone + tom visual por tipo de evento, para dar contexto rápido sem ler o texto todo.
const EVENT_META = {
  TICKET_NEW: { icon: Ticket, tone: "blue" },
  TICKET_ASSIGNED: { icon: UserCheck, tone: "blue" },
  TICKET_APPROVAL: { icon: ShieldCheck, tone: "amber" },
  TICKET_MESSAGE: { icon: MessageSquare, tone: "gray" },
  TICKET_RESOLVED: { icon: CheckCircle2, tone: "green" },
  TICKET_CANCELLED: { icon: XCircle, tone: "red" },
  TERM_SIGNATURE: { icon: FileCheck2, tone: "amber" },
  TERM_SIGNED: { icon: FileCheck2, tone: "green" },
  REMOTE_DENIED: { icon: ShieldAlert, tone: "red" },
  PASSWORD_RESET_REQUEST: { icon: KeyRound, tone: "red" },
};
const TONES = {
  blue: "bg-primary/10 text-primary",
  amber: "bg-amber-500/10 text-amber-600",
  green: "bg-secondary text-secondary-foreground",
  red: "bg-destructive/10 text-destructive",
  gray: "bg-muted text-muted-foreground",
};

// Agrupa notificações repetidas do mesmo evento+referência (ex.: várias mensagens no
// mesmo chamado) em um único cartão com contador, em vez de uma linha por evento.
function groupItems(items) {
  const groups = [];
  const byKey = new Map();
  for (const item of items) {
    const key = item.reference_id ? `${item.event_type}:${item.reference_id}` : item.id;
    const existing = byKey.get(key);
    if (existing) {
      existing.ids.push(item.id);
      existing.count += 1;
    } else {
      const group = { key, ids: [item.id], count: 1, latest: item };
      byKey.set(key, group);
      groups.push(group);
    }
  }
  return groups;
}

export function NotificationsBell({ onOpenTicket } = {}) {
  const [items, setItems] = useState([]);

  const load = useCallback(async () => {
    // Polling de fundo: ignora falha de rede (servidor reiniciando/offline) sem estourar erro.
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      if (response.ok) setItems((await response.json()).notifications || []);
    } catch { /* tenta de novo no próximo ciclo */ }
  }, []);

  useEffect(() => {
    // Polling de notificações: carrega ao montar e revalida a cada 30s.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const timer = setInterval(load, 30000);
    // Revalidação instantânea ao voltar o foco à aba (não espera o próximo ciclo).
    function onVisible() { if (document.visibilityState === "visible") load(); }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", load);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", load);
    };
  }, [load]);

  const groups = useMemo(() => groupItems(items), [items]);

  async function markAllRead() {
    await fetch("/api/notifications", { method: "PATCH" });
    setItems([]);
  }

  async function markIdsRead(event, ids) {
    event.preventDefault();
    event.stopPropagation();
    await Promise.all(ids.map((id) => fetch("/api/notifications", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    })));
    setItems((current) => current.filter((item) => !ids.includes(item.id)));
  }

  function handleOpen(item) {
    if (item.reference_type !== "TICKET" || !item.reference_id) return;
    if (typeof onOpenTicket === "function") onOpenTicket(item.reference_id);
    else if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("nexus:open-ticket", { detail: { id: item.reference_id } }));
    }
  }

  return <DropdownMenu>
    <DropdownMenuTrigger render={<Button variant="outline" size="icon" className="relative inline-flex" aria-label="Notificações" />}>
      <Bell />
      {items.length > 0 && <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-destructive text-[10px] font-bold text-white">{items.length > 9 ? "9+" : items.length}</span>}
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-96 p-0">
      <div className="flex items-center justify-between px-3 py-2.5">
        <p className="text-sm font-semibold">Notificações</p>
        {items.length > 0 && <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={markAllRead}>Marcar todas lidas</Button>}
      </div>
      <DropdownMenuSeparator className="m-0" />
      <div className="max-h-[26rem] overflow-y-auto py-1">
        {groups.length === 0 ? <p className="px-3 py-6 text-center text-xs text-muted-foreground">Nenhuma notificação nova.</p> : groups.map(({ key, ids, count, latest }) => {
          const meta = EVENT_META[latest.event_type] || { icon: Bell, tone: "gray" };
          const Icon = meta.icon;
          const clickable = latest.reference_type === "TICKET" && Boolean(latest.reference_id);
          return <DropdownMenuItem
            key={key}
            className={`items-start gap-2.5 rounded-none px-3 py-2.5${clickable ? " cursor-pointer" : ""}`}
            onClick={clickable ? () => handleOpen(latest) : undefined}
          >
            <span className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ${TONES[meta.tone]}`}><Icon className="size-4" /></span>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium">
                  {latest.title}
                  {count > 1 && <span className="ml-1.5 text-xs font-normal text-muted-foreground">×{count}</span>}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="-mr-1 -mt-0.5 size-6 shrink-0"
                  aria-label="Marcar como lida"
                  title="Marcar como lida"
                  onClick={(event) => markIdsRead(event, ids)}
                >
                  <Check className="size-3.5" />
                </Button>
              </div>
              <p className="line-clamp-2 text-xs text-muted-foreground">{latest.body}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground/80">{timeAgo(latest.created_at)}</p>
            </div>
          </DropdownMenuItem>;
        })}
      </div>
    </DropdownMenuContent>
  </DropdownMenu>;
}
