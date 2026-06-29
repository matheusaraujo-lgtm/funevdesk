"use client";

import { useMemo, useState } from "react";
import { Copy, KeyRound, Mail, MoreVertical, Pencil, Plus, Search, ShieldCheck, Trash2, UserCheck, Users, X } from "lucide-react";
import { toast } from "sonner";
import { ListEmptyState } from "@/components/list-empty-state";
import { ResponsiveSidePanel } from "@/components/responsive-side-panel";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const roleLabels = { ADMIN: "Administrador", TECHNICIAN: "Técnico", EMPLOYEE: "Usuário" };

function initials(name) {
  return name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase();
}

function MetricCard({ icon: Icon, label, value }) {
  return (
    <Card className="rounded-2xl border-0 shadow-none ring-1 ring-foreground/10">
      <CardContent className="flex items-center gap-3 p-5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-5" />
        </span>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold leading-tight">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function UserSidePanel({ user, onClose, onEdit, onResetPassword, onToggle, onDelete, currentUserId }) {
  return <Card className="h-fit gap-0 rounded-2xl border-0 py-0 shadow-none ring-1 ring-foreground/10 lg:sticky lg:top-24">
    <div className="flex items-center justify-between gap-3 border-b p-5"><p className="font-heading font-bold">{user.name}</p><Button variant="ghost" size="icon" className="size-8" onClick={onClose} aria-label="Fechar painel"><X /></Button></div>
    <div className="space-y-4 p-5">
      <div className="flex items-center gap-3"><Avatar className="size-10"><AvatarFallback>{initials(user.name)}</AvatarFallback></Avatar><div><p className="font-medium">{user.name}</p><p className="flex items-center gap-1 text-xs text-muted-foreground"><Mail className="size-3" />{user.email}</p></div></div>
      <Separator />
      <div><p className="mb-2 text-xs font-semibold">Perfil</p><Badge variant="outline">{roleLabels[user.role]}</Badge></div>
      <div><p className="mb-2 text-xs font-semibold">Unidades</p><div className="flex flex-wrap gap-1">{user.branches.map((branch) => <Badge key={branch.id} variant={branch.primary ? "secondary" : "outline"}>{branch.name}</Badge>)}</div></div>
      <div><p className="mb-2 text-xs font-semibold">Equipamento</p><p className="text-sm text-muted-foreground">{user.hostname || "Não vinculado"}</p></div>
      <div><p className="mb-2 text-xs font-semibold">Status</p><Badge variant={user.active ? "success" : "muted"}>{user.active ? "Ativo" : "Inativo"}</Badge></div>
    </div>
    <div className="grid gap-2 border-t p-5"><Button size="sm" variant="secondary" onClick={() => onEdit(user.id)}><Pencil /> Editar</Button><Button size="sm" variant="secondary" onClick={() => onResetPassword(user)}><KeyRound /> Resetar senha</Button><Button size="sm" variant="outline" onClick={() => onToggle(user.id, !user.active)}>{user.active ? "Desativar" : "Ativar"}</Button><Button size="sm" variant="destructive" disabled={user.id === currentUserId} onClick={() => onDelete(user)}><Trash2 /> Excluir</Button></div>
  </Card>;
}

export function UsersView({ users, currentUserId, createdCredential, onAckCredential, onNew, onEdit, onToggle, onDelete, onResetPassword }) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [resetResult, setResetResult] = useState(null);
  // Mesmo diálogo de credencial serve reset (estado interno) e criação (vinda por prop).
  const credential = resetResult || (createdCredential ? { user: { name: createdCredential.name }, password: createdCredential.password, isNew: true } : null);
  function closeCredential() { setResetResult(null); onAckCredential?.(); }
  const filtered = useMemo(() => users.filter((user) => `${user.name} ${user.email} ${user.branches.map((branch) => branch.name).join(" ")}`.toLowerCase().includes(search.toLowerCase())), [users, search]);
  const selected = users.find((user) => user.id === selectedId) || null;
  const active = users.filter((user) => user.active).length;

  async function resetPassword(user) {
    const result = await onResetPassword(user.id);
    if (result) setResetResult({ user, password: result.temporaryPassword });
  }

  return <div className="space-y-5 pb-6">
    {/* Header em destaque, no mesmo estilo do restante do app. */}
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/[0.07] via-card to-secondary/25 px-5 py-5 ring-1 ring-foreground/10 sm:px-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-start gap-3.5">
          <span className="hidden size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm sm:flex"><Users className="size-5" /></span>
          <div>
            <h1 className="page-title text-[26px]">Usuários</h1>
            <p className="page-copy max-w-md">Gerencie acessos, perfis e unidades autorizadas.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2"><Button onClick={onNew}><Plus /> Novo usuário</Button></div>
      </div>
    </div>
    <div className="grid gap-4 sm:grid-cols-3"><MetricCard icon={Users} label="Total" value={users.length} /><MetricCard icon={UserCheck} label="Ativos" value={active} /><MetricCard icon={ShieldCheck} label="Administradores" value={users.filter((user) => user.role === "ADMIN").length} /></div>
    <div className={`grid items-start gap-4 ${selected ? "lg:grid-cols-[minmax(0,1fr)_320px]" : ""}`}>
      <Card className="overflow-hidden gap-0 rounded-2xl border-0 py-0 shadow-none ring-1 ring-foreground/10">
        <div className="flex items-center justify-between gap-4 border-b p-4"><div className="relative flex-1 max-w-md"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar usuário ou unidade..." className="pl-9" /></div></div>
        {filtered.length === 0 ? (
          <ListEmptyState
            icon={Users}
            title={search ? "Nenhum usuário encontrado" : "Nenhum usuário cadastrado"}
            description={search ? "Tente outro termo de busca." : "Cadastre usuários para conceder acesso ao sistema."}
            actionLabel={!search ? "Novo usuário" : undefined}
            onAction={!search ? onNew : undefined}
          />
        ) : (
        <div className="overflow-x-auto"><Table className="min-w-[900px]"><TableHeader><TableRow className="bg-muted/10"><TableHead>Usuário</TableHead><TableHead>Perfil</TableHead><TableHead>Unidades</TableHead><TableHead>Equipamento</TableHead><TableHead>Status</TableHead><TableHead className="w-12" /></TableRow></TableHeader><TableBody>{filtered.map((user) => <TableRow key={user.id} data-state={selectedId === user.id ? "selected" : undefined} className={`cursor-pointer ${selectedId === user.id ? "border-l-2 border-l-primary bg-muted" : ""}`} onClick={() => setSelectedId(user.id)}><TableCell><div className="flex items-center gap-3"><Avatar><AvatarFallback>{initials(user.name)}</AvatarFallback></Avatar><div><p className="font-medium">{user.name}</p><p className="flex items-center gap-1 text-xs text-muted-foreground"><Mail className="size-3" />{user.email}</p></div></div></TableCell><TableCell><Badge variant="outline">{roleLabels[user.role]}</Badge></TableCell><TableCell><div className="flex max-w-[280px] flex-wrap gap-1">{user.branches.map((branch) => <Badge key={branch.id} variant={branch.primary ? "secondary" : "outline"}>{branch.name}</Badge>)}</div></TableCell><TableCell>{user.hostname || "Não vinculado"}</TableCell><TableCell><Badge variant={user.active ? "success" : "muted"}>{user.active ? "Ativo" : "Inativo"}</Badge></TableCell><TableCell onClick={(event) => event.stopPropagation()}><DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={`Ações de ${user.name}`} />}><MoreVertical /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => onEdit(user.id)}><Pencil /> Editar</DropdownMenuItem><DropdownMenuItem onClick={() => resetPassword(user)}><KeyRound /> Resetar senha</DropdownMenuItem><DropdownMenuItem onClick={() => onToggle(user.id, !user.active)}>{user.active ? <X /> : <UserCheck />}{user.active ? "Desativar" : "Ativar"}</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" disabled={user.id === currentUserId} onClick={() => setDeleteTarget(user)}><Trash2 /> Excluir</DropdownMenuItem></DropdownMenuContent></DropdownMenu></TableCell></TableRow>)}</TableBody></Table></div>
        )}
      </Card>
      {selected && (
        <ResponsiveSidePanel open onOpenChange={(open) => !open && setSelectedId(null)}>
          <UserSidePanel user={selected} onClose={() => setSelectedId(null)} onEdit={onEdit} onResetPassword={resetPassword} onToggle={onToggle} onDelete={setDeleteTarget} currentUserId={currentUserId} />
        </ResponsiveSidePanel>
      )}
    </div>
    <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}><DialogContent><DialogHeader><DialogTitle>Excluir usuário</DialogTitle><DialogDescription>Esta ação só será concluída se o usuário não possuir histórico de chamados ou auditoria.</DialogDescription></DialogHeader><p className="text-sm">Excluir <strong>{deleteTarget?.name}</strong>?</p><DialogFooter><Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button><Button variant="destructive" onClick={async () => { if (await onDelete(deleteTarget.id)) setDeleteTarget(null); }}><Trash2 /> Excluir definitivamente</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={Boolean(credential)} onOpenChange={(open) => !open && closeCredential()}><DialogContent><DialogHeader><DialogTitle>{credential?.isNew ? "Usuário criado" : "Senha temporária gerada"}</DialogTitle><DialogDescription>Anote a senha temporária — ela só aparece agora. O usuário deverá trocá-la no primeiro acesso.</DialogDescription></DialogHeader><div className="space-y-3"><p className="text-sm font-medium">{credential?.user.name}</p><div className="flex gap-2"><Input readOnly value={credential?.password || ""} /><Button variant="outline" size="icon" aria-label="Copiar senha" onClick={async () => { await navigator.clipboard.writeText(credential.password); toast.success("Senha copiada."); }}><Copy /></Button></div></div><DialogFooter><Button onClick={closeCredential}>Concluir</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
