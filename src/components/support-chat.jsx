import { Headset, Send } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/status-badge";

export function SupportChat({ tickets, selected, setSelected, messages, message, setMessage, sendMessage }) {
  return <div className="space-y-6"><div><h1 className="page-title">Atendimentos</h1><p className="page-copy">Conversa em tempo real entre o técnico e o colaborador.</p></div>
    <Card className="grid min-h-[650px] overflow-hidden p-0 lg:grid-cols-[320px_1fr]">
      <div className="border-b bg-muted/30 lg:border-b-0 lg:border-r"><div className="p-5"><p className="font-heading font-bold">Chamados ativos</p><p className="text-xs text-muted-foreground">{tickets.length} conversas disponíveis</p></div><Separator />
        <ScrollArea className="h-[240px] lg:h-[590px]"><div className="p-2">{tickets.map((ticket) => <Button key={ticket.id} variant={selected?.id === ticket.id ? "secondary" : "ghost"} className="mb-1 h-auto w-full justify-start p-3 text-left" onClick={() => setSelected(ticket)}><div className="min-w-0"><p className="truncate text-sm font-semibold">#{ticket.number} · {ticket.title}</p><p className="mt-1 truncate text-xs text-muted-foreground">{ticket.branch_name}</p></div></Button>)}</div></ScrollArea>
      </div>
      <div className="flex min-w-0 flex-col">{selected ? <>
        <div className="flex items-center gap-3 border-b p-4"><Avatar><AvatarFallback>{(selected.requester_name || selected.hostname || "US").split(" ").map((part) => part[0]).slice(0, 2).join("")}</AvatarFallback></Avatar><div className="min-w-0"><p className="truncate text-sm font-semibold">{selected.requester_name || selected.hostname || "Colaborador"}</p><p className="text-xs text-muted-foreground">#{selected.number} · {selected.branch_name}</p></div><div className="ml-auto flex items-center gap-2"><StatusBadge value={selected.status} />{selected.hostname && <Button variant="outline" size="sm"><Headset /> Conectar</Button>}</div></div>
        <ScrollArea className="h-[480px] flex-1 bg-muted/20"><div className="flex flex-col gap-3 p-5">{messages.map((item) => <div key={item.id} className={`max-w-[75%] rounded-xl px-4 py-3 ${item.sender_type === "TECHNICIAN" ? "ml-auto rounded-tr-sm bg-primary text-primary-foreground" : "rounded-tl-sm border bg-card"}`}><p className="mb-1 text-xs font-semibold">{item.sender_name}</p><p className="text-sm leading-relaxed">{item.body}</p><p className="mt-2 text-[10px] opacity-60">{new Date(item.created_at).toLocaleString("pt-BR")}</p></div>)}</div></ScrollArea>
        <form className="flex gap-2 border-t p-4" onSubmit={sendMessage}><Input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Escreva uma mensagem para o colaborador..." /><Button type="submit"><Send /> Enviar</Button></form>
      </> : <div className="grid min-h-[500px] place-items-center text-sm text-muted-foreground">Selecione um chamado para iniciar o atendimento.</div>}</div>
    </Card>
  </div>;
}
