"use client";

import { ChevronDown, LogOut, UserRound } from "lucide-react";
import { NotificationsBell } from "@/components/notifications-bell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

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

// Portal minimalista: sem sidebar. Só uma barra fina com a marca (volta ao
// formulário) e a conta do usuário — a navegação principal fica no centro da tela.
export function EmployeePortalNavbar({ setView, currentUser, onLogout }) {
  const appName = currentUser.appName || "FunevDesk";
  const logoUrl = currentUser.logoUrl || "";

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="flex h-16 items-center gap-2 px-4 md:px-6">
        <button type="button" onClick={() => setView("new-ticket")} aria-label="Ir para novo chamado" className="flex min-w-0 items-center gap-2.5 text-left">
          <BrandMark appName={appName} logoUrl={logoUrl} />
          <div className="hidden min-w-0 sm:block">
            <p className="truncate font-heading text-sm font-bold leading-none">{appName}</p>
            <p className="mt-1 truncate text-[10px] text-muted-foreground">Portal do usuário</p>
          </div>
        </button>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <NotificationsBell />
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-transparent px-1.5 transition-colors hover:border-border/60 hover:bg-accent/60">
              <Avatar className="size-8">
                {currentUser.avatarUrl && <AvatarImage src={currentUser.avatarUrl} alt={currentUser.name} />}
                <AvatarFallback>{initials(currentUser.name)}</AvatarFallback>
              </Avatar>
              <ChevronDown className="hidden size-3 text-muted-foreground sm:block" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="px-2 py-1.5 text-xs font-semibold">
                {currentUser.name}
                <br />
                <span className="font-normal text-muted-foreground">{currentUser.branchName}</span>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setView("profile")}><UserRound /> Meu perfil</DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={onLogout}><LogOut /> Sair</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
