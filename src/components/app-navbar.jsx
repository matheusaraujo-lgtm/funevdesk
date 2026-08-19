"use client";

import { useState } from "react";
import { Activity, BookOpen, Bug, Building2, Check, ChevronDown, ClipboardList, FileCheck2, FileText, FolderKanban, GitBranchPlus, Layers, LayoutDashboard, LogOut, MapPin, Menu, MonitorCog, Network, Package, Plus, Printer, Search, Settings2, ShieldAlert, ShieldCheck, Tags, Ticket, UserRound, Users, Webhook, Workflow, Wrench } from "lucide-react";
import { NotificationsBell } from "@/components/notifications-bell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";

// Regras de visibilidade de nav. Cada link declara o `module` que controla sua tela —
// o link só aparece se o perfil tiver permissão de VER aquele módulo. Links sem `module`
// caem em `requires(permissions)` (flags coarse), mantido como fallback.

const primaryLinks = [
  { id: "dashboard", label: "Visão geral", icon: LayoutDashboard },
  { id: "tickets", label: "Chamados", icon: Ticket, module: "tickets" },
];

// Ativos — inventário de equipamentos e impressoras monitoradas
const assetLinks = [
  { id: "assets", label: "Ativos", description: "Inventário de equipamentos", icon: MonitorCog, module: "assets" },
  { id: "printers", label: "Impressoras", description: "Toner, status e alertas", icon: Printer, module: "printers" },
];

// ITSM — gestão de problemas e mudanças
const itsmLinks = [
  { id: "problems", label: "Problemas", description: "Causa raiz e contorno", icon: Bug, module: "problems" },
  { id: "changes", label: "Mudanças", description: "Controle de mudanças", icon: GitBranchPlus, module: "changes" },
  { id: "projects", label: "Projetos", description: "Planejamento e execução", icon: FolderKanban, module: "projects" },
];

// Conhecimento — base de conhecimento e documentação
const knowledgeLinks = [
  { id: "knowledge", label: "Conhecimento", description: "Artigos e orientações", icon: BookOpen, module: "knowledge" },
  { id: "documentation", label: "Documentação", description: "Informações técnicas", icon: FileText, module: "documentation" },
];

// Monitoramento — gestão de eventos (rede, segurança)
const monitoringLinks = [
  { id: "network", label: "Monitoramento", description: "Dispositivos e links", icon: Network, module: "network" },
  { id: "security", label: "Segurança", description: "Ameaças XDR/EPP e triagem", icon: ShieldAlert, module: "security" },
];

// Administração — estoque, termos, catálogo, equipes e governança
const adminLinks = [
  { id: "inventory", label: "Estoque", description: "Materiais e suprimentos", icon: Package, module: "inventory" },
  { id: "terms", label: "Termos", description: "Assinatura e PDF", icon: FileCheck2, module: "terms" },
  { id: "teams", label: "Equipes", description: "Filas e responsáveis", icon: Users, module: "teams" },
  { id: "reports", label: "Relatórios", description: "KPIs e indicadores", icon: LayoutDashboard, module: "reports" },
  { id: "audit", label: "Auditoria", description: "Trilha de ações", icon: ClipboardList, module: "audit" },
];

// Configurações — setup do sistema, em subgrupos (organização, pessoas, catálogo, integrações)
const configGroups = [
  { label: "Organização", links: [
    { id: "settings", label: "Geral", description: "Organização e recursos", icon: Settings2, module: "settings" },
    { id: "settings-branches", label: "Unidades", description: "Matriz e filiais", icon: Building2, module: "branches" },
    { id: "settings-locations", label: "Localizações", description: "Salas e setores", icon: MapPin, module: "locations" },
  ] },
  { label: "Pessoas e acessos", links: [
    { id: "users", label: "Usuários", description: "Contas da equipe", icon: Users, module: "users" },
    { id: "profiles", label: "Perfis", description: "Permissões por tela", icon: ShieldCheck, module: "profiles" },
  ] },
  { label: "Catálogo de chamados", links: [
    { id: "settings-types", label: "Tipos de chamado", description: "Formulários e catálogo", icon: FileText, module: "ticket_types" },
    { id: "settings-statuses", label: "Situações", description: "Status e pausa de SLA", icon: Tags, module: "statuses" },
    { id: "settings-categories", label: "Categorias", description: "Grupos de tipos de chamado", icon: Layers, module: "categories" },
    { id: "term-templates", label: "Modelos de termo", description: "Textos para assinatura", icon: FileCheck2, module: "term_templates" },
    { id: "settings-document-types", label: "Tipos de documento", description: "Para a Documentação", icon: FileText, requires: (permissions) => permissions.canConfigure },
  ] },
  { label: "Automação e integrações", links: [
    { id: "automations", label: "Automações", description: "Regras de roteamento", icon: Workflow, requires: (permissions) => permissions.canConfigure && permissions.canViewAllBranches },
    { id: "webhooks", label: "Webhooks", description: "Integrações externas", icon: Webhook, module: "webhooks", requires: (permissions) => permissions.canViewAllBranches },
  ] },
];

const configLinks = configGroups.flatMap((group) => group.links);

const linkVisible = (item, permissions, can) => {
  if (item.module && !can(item.module, "read")) return false;
  return !item.requires || item.requires(permissions);
};
const visibleLinks = (links, permissions, can) => links.filter((item) => linkVisible(item, permissions, can));

function initials(name = "U") {
  return name.split(" ").map((part) => part[0]).slice(0, 2).join("");
}

function brandInitial(appName = "FunevDesk") {
  return appName.trim().slice(0, 1).toUpperCase() || "N";
}

function BrandMark({ appName, logoUrl, className = "size-9" }) {
  return (
    <div className={`grid ${className} place-items-center overflow-hidden rounded-xl ${logoUrl ? "bg-transparent" : "bg-primary text-primary-foreground"} font-heading text-lg font-extrabold`}>
      {logoUrl ? <img src={logoUrl} alt={appName} className="h-full w-full object-contain" /> : brandInitial(appName)}
    </div>
  );
}

function isSectionActive(view, sectionId) {
  if (sectionId === "tickets") return ["tickets", "details", "new-ticket"].includes(view);
  if (view === sectionId) return true;
  if (!view.startsWith(`${sectionId}-`)) return false;
  // Subrotas (sectionId-...) mantêm a seção ativa, mas uma seção "pai" (ex.: Geral = "settings")
  // não deve acender junto com as irmãs "settings-*": se um item mais específico casa, ele vence.
  return !configLinks.some((item) =>
    item.id !== sectionId
    && item.id.startsWith(`${sectionId}-`)
    && (view === item.id || view.startsWith(`${item.id}-`))
  );
}

function NavButton({ item, view, setView, ticketCount }) {
  const Icon = item.icon;
  const active = isSectionActive(view, item.id);
  return (
    <Button
      variant={active ? "secondary" : "ghost"}
      className={`h-8 w-full min-w-0 justify-start rounded-lg text-sm font-medium ${active ? "" : "text-muted-foreground"}`}
      onClick={() => setView(item.id)}>
      <Icon className="size-4 shrink-0" />
      <span className="truncate">{item.label}</span>
      {item.id === "tickets" && <Badge variant="secondary" className="ml-0.5 shrink-0" aria-label={`${ticketCount} chamados em aberto`}>{ticketCount}</Badge>}
    </Button>
  );
}

function PrimaryNav({ view, setView, ticketCount }) {
  return primaryLinks.map((item) => (
    <NavButton key={item.id} item={item} view={view} setView={setView} ticketCount={ticketCount} />
  ));
}

// Submenu recolhível: agrupa telas relacionadas sob um cabeçalho clicável, em vez de
// listar tudo sempre expandido — reduz a poluição visual do sidebar. Abre sozinho quando
// a seção contém a tela ativa; o usuário pode recolher/expandir o resto livremente.
function SidebarSubmenu({ label, icon: Icon, links, view, setView, permissions, can }) {
  const items = visibleLinks(links, permissions, can);
  const active = items.some((item) => isSectionActive(view, item.id));
  const [open, setOpen] = useState(active);
  const [prevActive, setPrevActive] = useState(active);
  if (active !== prevActive) {
    setPrevActive(active);
    if (active) setOpen(true);
  }
  if (!items.length) return null;
  return (
    <div className="grid gap-0.5">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className={`flex h-8 w-full items-center justify-between rounded-lg px-4 text-sm font-medium transition-colors ${active ? "text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
        <span className="flex items-center gap-2"><Icon className="size-4 shrink-0" />{label}</span>
        <ChevronDown className={`size-3.5 shrink-0 opacity-60 transition-transform ${open ? "" : "-rotate-90"}`} />
      </button>
      {open && (
        <div className="ml-3.5 grid gap-0.5 border-l border-border/60 pl-3.5">
          {items.map((item) => <NavButton key={item.id} item={item} view={view} setView={setView} />)}
        </div>
      )}
    </div>
  );
}

function visibleConfigGroups(permissions, can) {
  return configGroups
    .map((group) => ({ ...group, links: visibleLinks(group.links, permissions, can) }))
    .filter((group) => group.links.length);
}

// Configurações fica ao final do sidebar, num submenu recolhível com subgrupos internos
// (organização, pessoas, catálogo, integrações) — mesma lógica de SidebarSubmenu, com um
// nível a mais para não misturar setup do sistema com a navegação operacional.
function ConfigSubmenu({ view, setView, permissions, can }) {
  const groups = visibleConfigGroups(permissions, can);
  const active = configLinks.some((item) => isSectionActive(view, item.id));
  const [open, setOpen] = useState(active);
  const [prevActive, setPrevActive] = useState(active);
  if (active !== prevActive) {
    setPrevActive(active);
    if (active) setOpen(true);
  }
  if (!groups.length) return null;
  return (
    <div className="grid gap-0.5">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className={`flex h-8 w-full items-center justify-between rounded-lg px-4 text-sm font-medium transition-colors ${active ? "text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
        <span className="flex items-center gap-2"><Settings2 className="size-4 shrink-0" />Configurações</span>
        <ChevronDown className={`size-3.5 shrink-0 opacity-60 transition-transform ${open ? "" : "-rotate-90"}`} />
      </button>
      {open && (
        <div className="ml-3.5 grid gap-2.5 border-l border-border/60 pl-3.5">
          {groups.map((group) => (
            <div key={group.label} className="grid gap-0.5">
              <p className="px-2 pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">{group.label}</p>
              {group.links.map((item) => <NavButton key={item.id} item={item} view={view} setView={setView} />)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SidebarNav({ view, setView, ticketCount, permissions, can }) {
  return (
    <nav className="grid gap-3" aria-label="Principal">
      <div className="grid gap-0.5">
        <PrimaryNav view={view} setView={setView} ticketCount={ticketCount} />
      </div>
      <SidebarSubmenu label="Ativos" icon={MonitorCog} links={assetLinks} view={view} setView={setView} permissions={permissions} can={can} />
      <SidebarSubmenu label="ITSM" icon={Wrench} links={itsmLinks} view={view} setView={setView} permissions={permissions} can={can} />
      <SidebarSubmenu label="Conhecimento" icon={BookOpen} links={knowledgeLinks} view={view} setView={setView} permissions={permissions} can={can} />
      <SidebarSubmenu label="Monitoramento" icon={Activity} links={monitoringLinks} view={view} setView={setView} permissions={permissions} can={can} />
      <SidebarSubmenu label="Administração" icon={Layers} links={adminLinks} view={view} setView={setView} permissions={permissions} can={can} />
      <ConfigSubmenu view={view} setView={setView} permissions={permissions} can={can} />
    </nav>
  );
}

// O atalho global "Novo chamado" no topbar é contextual: some onde é redundante
// (já dentro de um chamado), onde a própria tela já tem seu CTA (detalhe do ativo)
// ou em contexto de configuração/administração e formulários — evita CTAs competindo.
const NEW_TICKET_HIDDEN_VIEWS = new Set([
  "new-ticket", "details", "asset-detail", "profile",
  "audit", "automations", "profiles", "teams", "webhooks", "users",
  "term-templates", "term-templates-detail", "terms", "terms-detail",
]);
function showNewTicketCta(view) {
  if (typeof view !== "string") return true;
  return !NEW_TICKET_HIDDEN_VIEWS.has(view) && !view.startsWith("settings") && !view.endsWith("-form");
}

export function AppNavbar({ view, setView, ticketCount, branches, branchId, setBranchId, onNewTicket, currentUser, permissions, can = () => false, onLogout }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = (nextView) => {
    setView(nextView);
    setMenuOpen(false);
  };
  const selectedBranch = branches.find((branch) => branch.id === branchId);
  const appName = currentUser.appName || "FunevDesk";
  const logoUrl = currentUser.logoUrl || "";
  const branchLabel = selectedBranch ? `${selectedBranch.type === "MATRIZ" ? "Matriz" : "Filial"} - ${selectedBranch.name}` : "Todas as unidades";

  const rightControls = (
    <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
      <button
        type="button"
        onClick={() => window.dispatchEvent(new CustomEvent("nexus:open-command"))}
        className="hidden h-9 items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3 text-xs text-muted-foreground transition-colors hover:bg-muted lg:inline-flex"
        aria-label="Buscar telas e ações (atalho Ctrl K)">
        <Search className="size-3.5" /> Buscar
        <kbd className="rounded border bg-muted px-1 text-[10px]">Ctrl K</kbd>
      </button>
      {permissions.canSelectBranches && (
        <DropdownMenu>
          <DropdownMenuTrigger
            className="hidden h-9 shrink-0 items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted aria-expanded:bg-muted aria-expanded:text-foreground lg:inline-flex"
            aria-label="Trocar de unidade">
            <Building2 className="size-3.5 shrink-0" />
            <span className="max-w-[140px] truncate">{branchLabel}</span>
            <ChevronDown className="size-3 shrink-0 opacity-70" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <p className="flex items-center gap-1.5 px-2 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Building2 className="size-3.5" /> Unidade
            </p>
            <div className="max-h-64 overflow-y-auto">
              <DropdownMenuItem onClick={() => setBranchId("")} className="gap-2">
                <Check className={`size-4 shrink-0 ${branchId ? "opacity-0" : "opacity-100"}`} />
                <span>Todas as unidades</span>
              </DropdownMenuItem>
              {branches.map((branch) => (
                <DropdownMenuItem key={branch.id} onClick={() => setBranchId(branch.id)} className="gap-2">
                  <Check className={`size-4 shrink-0 ${branchId === branch.id ? "opacity-100" : "opacity-0"}`} />
                  <span>{branch.type === "MATRIZ" ? "Matriz" : "Filial"} - {branch.name}</span>
                </DropdownMenuItem>
              ))}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <NotificationsBell />

      {showNewTicketCta(view) && (
        <Button onClick={onNewTicket} size="sm" className="shrink-0 sm:h-9" title="Abrir chamado" aria-label="Abrir chamado">
          <Plus />
          <span className="hidden min-[1600px]:inline">Abrir chamado</span>
        </Button>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-transparent px-1.5 transition-colors hover:border-border/60 hover:bg-accent/60">
          <Avatar className="size-8">
            {currentUser.avatarUrl && <AvatarImage src={currentUser.avatarUrl} alt={currentUser.name} />}
            <AvatarFallback>{initials(currentUser.name)}</AvatarFallback>
          </Avatar>
          <ChevronDown className="hidden size-3 text-muted-foreground sm:block" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <div className="px-2 py-1.5 text-xs font-semibold">
            {currentUser.name}
            <br />
            <span className="font-normal text-muted-foreground">{currentUser.roleLabel} - {currentUser.branchName}</span>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => navigate("profile")}><UserRound /> Meu perfil</DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={onLogout}><LogOut /> Sair</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetTrigger
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border bg-background shadow-xs transition-colors hover:bg-accent lg:hidden"
          aria-label="Abrir menu">
          <Menu className="size-4" />
        </SheetTrigger>
        <SheetContent side="left" className="flex w-[min(100vw-2rem,320px)] flex-col overflow-hidden p-0">
          <SheetHeader className="shrink-0 border-b px-4 py-4"><SheetTitle>{appName}</SheetTitle></SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
            <div className="grid gap-2 pt-4">
              <SidebarNav view={view} setView={navigate} ticketCount={ticketCount} permissions={permissions} can={can} />
              <Separator className="my-3" />
              {permissions.canSelectBranches && (
                <Select value={branchId || "all"} onValueChange={(value) => setBranchId(value === "all" ? "" : value)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={branchLabel}>
                      {(value) => value === "all" ? "Todas as unidades" : branches.find((branch) => branch.id === value)?.name}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as unidades</SelectItem>
                    {branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-50 hidden w-72 flex-col border-r border-border/60 bg-background/80 backdrop-blur-xl lg:flex">
        <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-border/60 px-5">
          <BrandMark appName={appName} logoUrl={logoUrl} />
          <div className="min-w-0">
            <p className="truncate font-heading text-sm font-bold leading-none">{appName}</p>
            <p className="mt-1 truncate text-[10px] text-muted-foreground">{currentUser.organizationName || "Operações de TI"}</p>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-3">
          <SidebarNav view={view} setView={setView} ticketCount={ticketCount} permissions={permissions} can={can} />
        </div>
      </aside>
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl lg:ml-72">
        <div className="flex h-16 min-w-0 items-center gap-2 px-4 md:px-7 lg:px-9">
          <div className="flex min-w-0 shrink items-center gap-2.5 lg:hidden">
            <BrandMark appName={appName} logoUrl={logoUrl} />
            <div className="hidden min-w-0 sm:block">
              <p className="truncate font-heading text-sm font-bold leading-none">{appName}</p>
              <p className="mt-1 truncate text-[10px] text-muted-foreground">{currentUser.organizationName || "Operações de TI"}</p>
            </div>
          </div>
          {rightControls}
        </div>
      </header>
    </>
  );
}
