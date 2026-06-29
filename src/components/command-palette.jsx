"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, Bug, Building2, ClipboardList, FileCheck2, FileText, GitBranchPlus, KeyRound,
  Layers, LayoutDashboard, MapPin, MonitorCog, Network, Package, Plus, Printer, Search,
  Settings2, ShieldAlert, ShieldCheck, Tags, Ticket, Users, Webhook, Workflow,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

// Fonte única dos destinos navegáveis pela paleta. Cada item é filtrado pela permissão
// do perfil (module → can(module,"read"); requires → flag coarse).
const COMMANDS = [
  { id: "dashboard", label: "Visão geral", group: "Ir para", icon: LayoutDashboard },
  { id: "tickets", label: "Chamados", group: "Ir para", icon: Ticket, module: "tickets" },
  { id: "assets", label: "Ativos", group: "Ir para", icon: MonitorCog, requires: (p) => p.canViewAssets },
  { id: "printers", label: "Impressoras", group: "Ir para", icon: Printer, module: "printers" },
  { id: "network", label: "Monitoramento de rede", group: "Ir para", icon: Network, module: "network" },
  { id: "security", label: "Segurança", group: "Ir para", icon: ShieldAlert, module: "security" },
  { id: "problems", label: "Problemas", group: "Ir para", icon: Bug, module: "problems" },
  { id: "changes", label: "Mudanças", group: "Ir para", icon: GitBranchPlus, module: "changes" },
  { id: "knowledge", label: "Base de conhecimento", group: "Ir para", icon: FileText, module: "knowledge" },
  { id: "documentation", label: "Documentação", group: "Ir para", icon: FileText, module: "documentation" },
  { id: "inventory", label: "Estoque", group: "Ir para", icon: Package, module: "inventory" },
  { id: "terms", label: "Termos de equipamento", group: "Ir para", icon: FileCheck2, module: "terms" },
  { id: "teams", label: "Equipes", group: "Ir para", icon: Users, module: "teams" },
  { id: "reports", label: "Relatórios", group: "Ir para", icon: LayoutDashboard, requires: (p) => p.canViewReports },
  { id: "audit", label: "Auditoria", group: "Ir para", icon: ClipboardList, requires: (p) => p.canViewAudit },
  { id: "settings", label: "Configurações gerais", group: "Configurações", icon: Settings2, module: "settings" },
  { id: "settings-branches", label: "Unidades", group: "Configurações", icon: Building2, module: "branches" },
  { id: "settings-locations", label: "Localizações", group: "Configurações", icon: MapPin, module: "locations" },
  { id: "users", label: "Usuários", group: "Configurações", icon: Users, module: "users" },
  { id: "profiles", label: "Perfis e permissões", group: "Configurações", icon: ShieldCheck, module: "profiles" },
  { id: "settings-types", label: "Tipos de chamado", group: "Configurações", icon: FileText, module: "ticket_types" },
  { id: "settings-categories", label: "Categorias", group: "Configurações", icon: Layers, module: "categories" },
  { id: "settings-statuses", label: "Situações", group: "Configurações", icon: Tags, module: "statuses" },
  { id: "term-templates", label: "Modelos de termo", group: "Configurações", icon: FileCheck2, module: "term_templates" },
  { id: "automations", label: "Automações", group: "Configurações", icon: Workflow, requires: (p) => p.canConfigure },
  { id: "webhooks", label: "Webhooks", group: "Configurações", icon: Webhook, module: "webhooks" },
];

const ACTION_NEW_TICKET = { id: "__new-ticket", label: "Abrir novo chamado", group: "Ações", icon: Plus, action: "new-ticket" };

export function CommandPalette({ can = () => false, permissions = {}, setView, onNewTicket }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef(null);

  useEffect(() => {
    function onKey(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
    }
    function onOpen() { setOpen(true); }
    window.addEventListener("keydown", onKey);
    window.addEventListener("nexus:open-command", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("nexus:open-command", onOpen);
    };
  }, []);

  const items = useMemo(() => {
    const navItems = COMMANDS.filter((cmd) => {
      if (cmd.module) return can(cmd.module, "read");
      if (cmd.requires) return cmd.requires(permissions);
      return true;
    });
    return [ACTION_NEW_TICKET, ...navItems];
  }, [can, permissions]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return items;
    return items.filter((cmd) => cmd.label.toLowerCase().includes(term));
  }, [items, query]);

  // Mantém a seleção dentro do range a cada nova busca.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActive(0);
  }, [query, open]);

  function run(cmd) {
    setOpen(false);
    setQuery("");
    if (cmd?.action === "new-ticket") onNewTicket?.();
    else if (cmd) setView?.(cmd.id);
  }

  function onInputKeyDown(event) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((current) => Math.min(filtered.length - 1, current + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((current) => Math.max(0, current - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      run(filtered[active]);
    }
  }

  let lastGroup = null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent showCloseButton={false} className="top-[20%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">Buscar comando</DialogTitle>
        <div className="flex items-center gap-2 border-b px-4">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Buscar tela ou ação..."
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden rounded border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline">ESC</kbd>
        </div>
        <div ref={listRef} className="max-h-[min(60vh,360px)] overflow-y-auto p-1.5">
          {filtered.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">Nada encontrado.</p>
          ) : (
            filtered.map((cmd, index) => {
              const Icon = cmd.icon;
              const showGroup = cmd.group !== lastGroup;
              lastGroup = cmd.group;
              return (
                <div key={cmd.id}>
                  {showGroup && <p className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{cmd.group}</p>}
                  <button
                    type="button"
                    onMouseEnter={() => setActive(index)}
                    onClick={() => run(cmd)}
                    className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm ${index === active ? "bg-accent text-accent-foreground" : "text-foreground"}`}
                  >
                    <Icon className="size-4 shrink-0 text-muted-foreground" />
                    <span>{cmd.label}</span>
                  </button>
                </div>
              );
            })
          )}
        </div>
        <div className="flex items-center gap-3 border-t px-4 py-2 text-[10px] text-muted-foreground">
          <span><kbd className="rounded border bg-muted px-1 py-0.5">↑↓</kbd> navegar</span>
          <span><kbd className="rounded border bg-muted px-1 py-0.5">↵</kbd> abrir</span>
          <span className="ml-auto"><KeyRound className="mr-1 inline size-3" />⌘K / Ctrl+K</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
