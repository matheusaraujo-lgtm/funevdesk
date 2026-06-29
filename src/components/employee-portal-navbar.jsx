"use client";

import { useState } from "react";
import { BookOpen, ChevronDown, LogOut, Menu, Plus, Ticket } from "lucide-react";
import { NotificationsBell } from "@/components/notifications-bell";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

function initials(name = "U") {
  return name.split(" ").map((part) => part[0]).slice(0, 2).join("");
}

function BrandMark({ appName, logoUrl }) {
  const fallback = appName.trim().slice(0, 1).toUpperCase() || "N";
  return (
    <div className={`grid size-9 place-items-center overflow-hidden rounded-xl ${logoUrl ? "bg-transparent" : "bg-primary text-primary-foreground"} font-heading text-lg font-extrabold`}>
      {logoUrl ? <img src={logoUrl} alt={appName} className="h-full w-full object-contain" /> : fallback}
    </div>
  );
}

function NavLink({ active, label, icon: Icon, onClick, mobile = false }) {
  return (
    <Button
      variant={active ? "secondary" : "ghost"}
      className={mobile
        ? `w-full justify-start rounded-lg font-medium ${active ? "" : "text-muted-foreground"}`
        : `h-9 shrink-0 justify-start rounded-full px-3 font-medium ${active ? "" : "text-muted-foreground"}`}
      onClick={onClick}>
      <Icon className="size-4" />
      {label}
    </Button>
  );
}

export function EmployeePortalNavbar({ view, setView, currentUser, onLogout }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const appName = currentUser.appName || "FunevDesk";
  const logoUrl = currentUser.logoUrl || "";
  const isSidebar = currentUser.navigationMode === "SIDEBAR";
  const navigate = (next) => { setView(next); setMenuOpen(false); };
  const links = [
    { id: "new-ticket", label: "Novo chamado", icon: Plus },
    { id: "my-tickets", label: "Meus chamados", icon: Ticket },
    { id: "knowledge", label: "Ajuda", icon: BookOpen },
  ];
  const isActive = (id) => view === id || (id === "my-tickets" && view === "details") || (id === "knowledge" && view === "knowledge-detail");

  // Drawer mobile (mesmo em sidebar, telas pequenas usam o gatilho hambúrguer).
  const mobileMenu = (
    <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
      <SheetTrigger className={`inline-flex size-9 items-center justify-center rounded-lg border bg-background shadow-xs transition-colors hover:bg-accent ${isSidebar ? "lg:hidden" : "md:hidden"}`} aria-label="Abrir menu">
        <Menu className="size-4" />
      </SheetTrigger>
      <SheetContent side="left" className="w-[min(100vw-2rem,300px)]">
        <SheetHeader><SheetTitle>Menu</SheetTitle></SheetHeader>
        <div className="mt-6 grid gap-1.5">
          {links.map((link) => (
            <NavLink key={link.id} active={isActive(link.id)} label={link.label} icon={link.icon} onClick={() => navigate(link.id)} mobile />
          ))}
          <Separator className="my-2" />
          <Button variant="outline" onClick={() => { setMenuOpen(false); onLogout(); }}><LogOut /> Sair</Button>
        </div>
      </SheetContent>
    </Sheet>
  );

  // Menu do avatar com logout — mesmo padrão do admin/técnico.
  const userMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-transparent px-1.5 transition-colors hover:border-border/60 hover:bg-accent/60">
        <Avatar className="size-8"><AvatarFallback>{initials(currentUser.name)}</AvatarFallback></Avatar>
        <ChevronDown className="hidden size-3 text-muted-foreground sm:block" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="px-2 py-1.5 text-xs font-semibold">
          {currentUser.name}
          <br />
          <span className="font-normal text-muted-foreground">{currentUser.branchName}</span>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={onLogout}><LogOut /> Sair</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (isSidebar) {
    return (
      <>
        <aside className="fixed inset-y-0 left-0 z-50 hidden w-60 flex-col border-r border-border/60 bg-background/80 backdrop-blur-xl lg:flex">
          <button type="button" onClick={() => setView("my-tickets")} aria-label="Ir para meus chamados" className="flex h-16 shrink-0 items-center gap-2.5 border-b border-border/60 px-5 text-left">
            <BrandMark appName={appName} logoUrl={logoUrl} />
            <div className="min-w-0">
              <p className="truncate font-heading text-sm font-bold leading-none">{appName}</p>
              <p className="mt-1 truncate text-[10px] text-muted-foreground">Portal do usuário</p>
            </div>
          </button>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <nav className="grid content-start gap-1.5" aria-label="Portal do usuário">
              {links.map((link) => (
                <NavLink key={link.id} active={isActive(link.id)} label={link.label} icon={link.icon} onClick={() => setView(link.id)} mobile />
              ))}
            </nav>
          </div>
        </aside>
        <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl lg:ml-60">
          <div className="flex h-16 min-w-0 items-center gap-2 px-4 md:px-7 lg:px-9">
            <div className="flex min-w-0 shrink items-center gap-2.5 lg:hidden">
              <BrandMark appName={appName} logoUrl={logoUrl} />
              <p className="hidden truncate font-heading text-sm font-bold leading-none sm:block">{appName}</p>
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
              <NotificationsBell />
              {userMenu}
              {mobileMenu}
            </div>
          </div>
        </header>
      </>
    );
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="app-container flex h-16 min-w-0 items-center gap-2 sm:gap-3">
        <button type="button" onClick={() => setView("my-tickets")} aria-label="Ir para meus chamados" className="flex shrink-0 cursor-pointer items-center gap-2.5">
          <BrandMark appName={appName} logoUrl={logoUrl} />
          <div className="hidden sm:block">
            <p className="whitespace-nowrap font-heading text-sm font-bold leading-none">{appName}</p>
            <p className="mt-1 text-[10px] text-muted-foreground">Portal do usuário</p>
          </div>
        </button>

        <Separator orientation="vertical" className="mx-1 hidden h-6 shrink-0 bg-border/60 md:block" />

        <nav className="hidden min-w-0 flex-1 items-center gap-1.5 md:flex" aria-label="Portal do usuário">
          {links.map((link) => (
            <NavLink key={link.id} active={isActive(link.id)} label={link.label} icon={link.icon} onClick={() => setView(link.id)} />
          ))}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          <NotificationsBell />
          {userMenu}
          {mobileMenu}
        </div>
      </div>
    </header>
  );
}
