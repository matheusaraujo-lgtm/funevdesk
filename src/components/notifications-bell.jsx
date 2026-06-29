"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

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
    // Polling de notificações: carrega ao montar e revalida a cada 60s.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, [load]);

  async function markAllRead() {
    await fetch("/api/notifications", { method: "PATCH" });
    setItems([]);
  }

  async function markOneRead(event, id) {
    event.preventDefault();
    event.stopPropagation();
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setItems((current) => current.filter((item) => item.id !== id));
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
    <DropdownMenuContent align="end" className="w-80">
      <div className="flex items-center justify-between px-2 py-1.5"><p className="text-sm font-semibold">Notificações</p>{items.length > 0 && <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={markAllRead}>Marcar lidas</Button>}</div>
      <DropdownMenuSeparator />
      {items.length === 0 ? <p className="px-2 py-4 text-center text-xs text-muted-foreground">Nenhuma notificação nova.</p> : items.slice(0, 8).map((item) => {
        const clickable = item.reference_type === "TICKET" && Boolean(item.reference_id);
        return <DropdownMenuItem
          key={item.id}
          className={`flex-col items-start gap-1${clickable ? " cursor-pointer" : ""}`}
          onClick={clickable ? () => handleOpen(item) : undefined}
        >
          <div className="flex w-full items-start justify-between gap-2">
            <span className="text-sm font-medium">{item.title}</span>
            <Button
              variant="ghost"
              size="icon"
              className="-mr-1 -mt-0.5 size-6 shrink-0"
              aria-label="Marcar como lida"
              title="Marcar como lida"
              onClick={(event) => markOneRead(event, item.id)}
            >
              <Check className="size-3.5" />
            </Button>
          </div>
          <span className="line-clamp-2 text-xs text-muted-foreground">{item.body}</span>
          <Badge variant="muted" className="text-[10px]">{new Date(item.created_at).toLocaleString("pt-BR")}</Badge>
        </DropdownMenuItem>;
      })}
    </DropdownMenuContent>
  </DropdownMenu>;
}
