"use client";

import { useCallback, useMemo, useState } from "react";
import { Building2, Hash, MapPin, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useReloadableData } from "@/lib/use-reloadable-data";
import { ListEmptyState } from "@/components/list-empty-state";
import { ImportTemplateButtons } from "@/components/import-template-buttons";
import { ListLoadingSkeleton } from "@/components/list-loading-skeleton";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function MetricCard({ icon: Icon, label, value, tone = "blue" }) {
  const tones = {
    blue: "bg-primary/10 text-primary ring-primary/15",
    green: "bg-secondary text-secondary-foreground ring-foreground/10",
    gray: "bg-muted text-muted-foreground ring-foreground/10",
  };
  return (
    <Card className="rounded-2xl border-0 shadow-none ring-1 ring-foreground/10">
      <CardContent className="flex items-center gap-4 p-5">
        <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ring-1 ${tones[tone]}`}><Icon className="size-5" /></span>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 font-heading text-2xl font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function SettingsLocationsView({ branches = [] }) {
  const [locations, setLocations] = useState([]);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [branchId, setBranchId] = useState(branches[0]?.id || "");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [editTarget, setEditTarget] = useState(null);
  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState("");
  const [editBranchId, setEditBranchId] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { loading, reload: load } = useReloadableData(useCallback(async () => {
    const response = await fetch("/api/locations", { cache: "no-store" });
    if (response.ok) setLocations((await response.json()).locations || []);
  }, []));

  const stats = useMemo(() => ({
    total: locations.length,
    branches: new Set(locations.map((l) => l.branch_id)).size,
    coded: locations.filter((l) => l.code).length,
  }), [locations]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return locations;
    return locations.filter((l) => `${l.name} ${l.code || ""} ${l.branch_name || ""}`.toLowerCase().includes(term));
  }, [locations, search]);

  function openCreate() {
    setBranchId(branches[0]?.id || "");
    setName("");
    setCode("");
    setCreateOpen(true);
  }

  async function createLocation(event) {
    event.preventDefault();
    if (!branchId || name.trim().length < 2) return toast.error("Unidade e nome são obrigatórios.");
    const response = await fetch("/api/locations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ branchId, name: name.trim(), code: code.trim() || undefined }),
    });
    const result = await response.json();
    if (!response.ok) return toast.error(result.error || "Não foi possível criar.");
    setName("");
    setCode("");
    setCreateOpen(false);
    await load();
    toast.success("Localização criada.");
  }

  function openEdit(loc) {
    setEditTarget(loc);
    setEditName(loc.name);
    setEditCode(loc.code || "");
    setEditBranchId(loc.branch_id);
  }

  async function saveEdit() {
    if (editName.trim().length < 2) return toast.error("Informe um nome válido.");
    setSavingEdit(true);
    const response = await fetch(`/api/locations/${editTarget.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: editName.trim(), code: editCode.trim() || null, branchId: editBranchId }),
    });
    const result = await response.json().catch(() => ({}));
    setSavingEdit(false);
    if (!response.ok) return toast.error(result.error || "Não foi possível salvar.");
    setEditTarget(null);
    await load();
    toast.success("Localização atualizada.");
  }

  async function confirmDelete() {
    const response = await fetch(`/api/locations/${deleteTarget.id}`, { method: "DELETE" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      setDeleteTarget(null);
      return toast.error(result.error || "Não foi possível excluir.");
    }
    setDeleteTarget(null);
    await load();
    toast.success("Localização excluída.");
  }

  return (
    <div className="space-y-5 pb-6">
      <PageHeader
        icon={MapPin}
        title="Localizações"
        description="Salas, andares e setores por unidade — usados no agente e nos chamados."
        actions={<div className="flex flex-wrap items-center gap-2"><ImportTemplateButtons endpoint="/api/locations" templateFile="modelo-localizacoes.csv" onImported={load} label="localização" /><Button onClick={openCreate}><Plus /> Nova localização</Button></div>}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard icon={MapPin} label="Localizações" value={stats.total} tone="blue" />
        <MetricCard icon={Building2} label="Unidades cobertas" value={stats.branches} tone="green" />
        <MetricCard icon={Hash} label="Com código" value={stats.coded} tone="gray" />
      </div>

      <Card className="gap-0 overflow-hidden rounded-2xl border-0 py-0 shadow-none ring-1 ring-foreground/10">
        <div className="border-b p-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome, código ou unidade..." className="h-9 pl-9" />
          </div>
        </div>
        {loading ? <ListLoadingSkeleton /> : filtered.length === 0 ? (
          <ListEmptyState
            icon={MapPin}
            title={locations.length === 0 ? "Nenhuma localização" : "Nenhuma localização encontrada"}
            description={locations.length === 0 ? "Cadastre salas e setores para os usuários selecionarem." : "Ajuste a busca para localizar."}
            actionLabel={locations.length === 0 ? "Nova localização" : undefined}
            onAction={locations.length === 0 ? openCreate : undefined}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/10">
                <TableHead>Nome</TableHead>
                <TableHead className="w-[160px]">Código</TableHead>
                <TableHead className="w-[200px]">Unidade</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((loc) => (
                <TableRow key={loc.id}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><MapPin className="size-4" /></span>
                      <span className="font-medium">{loc.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>{loc.code ? <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">{loc.code}</code> : <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{loc.branch_name}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" className="size-8" aria-label={`Editar ${loc.name}`} onClick={() => openEdit(loc)}><Pencil className="size-4" /></Button>
                    <Button variant="ghost" size="icon" className="size-8" aria-label={`Excluir ${loc.name}`} onClick={() => setDeleteTarget(loc)}><Trash2 className="size-4 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Nova localização</DialogTitle></DialogHeader>
          <form className="grid gap-4" onSubmit={createLocation}>
            <div className="space-y-1.5">
              <Label htmlFor="loc-branch">Unidade</Label>
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger id="loc-branch" className="bg-card" aria-label="Unidade"><SelectValue placeholder="Unidade">{(v) => branches.find((b) => b.id === v)?.name}</SelectValue></SelectTrigger>
                <SelectContent>{branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="loc-name">Nome</Label>
              <Input id="loc-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Sala 201" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="loc-code">Código (opcional)</Label>
              <Input id="loc-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Ex.: SL-201" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
              <Button type="submit"><Plus /> Criar localização</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editTarget)} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar localização</DialogTitle>
            <DialogDescription>Atualize o nome, código ou unidade da localização.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="loc-edit-branch">Unidade</Label>
              <Select value={editBranchId} onValueChange={setEditBranchId}>
                <SelectTrigger id="loc-edit-branch" className="bg-card" aria-label="Unidade"><SelectValue placeholder="Unidade">{(v) => branches.find((b) => b.id === v)?.name}</SelectValue></SelectTrigger>
                <SelectContent>{branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="loc-edit-name">Nome</Label>
              <Input id="loc-edit-name" value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Nome" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="loc-edit-code">Código (opcional)</Label>
              <Input id="loc-edit-code" value={editCode} onChange={(e) => setEditCode(e.target.value)} placeholder="Código" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancelar</Button>
            <Button onClick={saveEdit} disabled={savingEdit}>{savingEdit ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir localização</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir &quot;{deleteTarget?.name}&quot;? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmDelete}>Excluir definitivamente</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
