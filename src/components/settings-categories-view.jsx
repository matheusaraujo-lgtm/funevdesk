"use client";

import { useCallback, useMemo, useState } from "react";
import { CheckCircle2, Layers, Plus, Tags, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useReloadableData } from "@/lib/use-reloadable-data";
import { ListEmptyState } from "@/components/list-empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const colorOptions = [
  { value: "blue", label: "Azul", swatch: "bg-blue-500" },
  { value: "violet", label: "Violeta", swatch: "bg-violet-500" },
  { value: "amber", label: "Âmbar", swatch: "bg-amber-500" },
  { value: "green", label: "Verde", swatch: "bg-green-500" },
  { value: "red", label: "Vermelho", swatch: "bg-red-500" },
  { value: "slate", label: "Cinza", swatch: "bg-slate-500" },
];

const colorMap = Object.fromEntries(colorOptions.map((c) => [c.value, c]));

function ColorSwatch({ value }) {
  const option = colorMap[value];
  return <span className={`inline-block size-3 shrink-0 rounded-full ${option?.swatch || "bg-muted"}`} />;
}

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

export function SettingsCategoriesView() {
  const [categories, setCategories] = useState([]);
  const [name, setName] = useState("");
  const [color, setColor] = useState("blue");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { loading, reload: load } = useReloadableData(useCallback(async () => {
    const response = await fetch("/api/categories", { cache: "no-store" });
    if (response.ok) setCategories((await response.json()).categories);
  }, []));

  const stats = useMemo(() => ({
    total: categories.length,
    active: categories.filter((c) => c.active).length,
    types: categories.reduce((sum, c) => sum + (Number(c.type_count) || 0), 0),
  }), [categories]);

  async function createCategory(event) {
    event.preventDefault();
    const response = await fetch("/api/categories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, color }),
    });
    const result = await response.json();
    if (!response.ok) return toast.error(result.error || "Não foi possível criar.");
    toast.success("Categoria criada.");
    setName("");
    setColor("blue");
    setCreateOpen(false);
    load();
  }

  async function toggleCategory(category) {
    const response = await fetch(`/api/categories/${category.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active: !category.active }),
    });
    if (!response.ok) return toast.error("Não foi possível atualizar.");
    load();
  }

  async function removeCategory(category) {
    const response = await fetch(`/api/categories/${category.id}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) return toast.error(result.error || "Não foi possível excluir.");
    toast.success("Categoria removida.");
    setDeleteTarget(null);
    load();
  }

  return (
    <div className="space-y-5 pb-6">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/[0.07] via-card to-secondary/25 px-5 py-5 ring-1 ring-foreground/10 sm:px-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3.5">
            <span className="hidden size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm sm:flex"><Tags className="size-5" /></span>
            <div>
              <h1 className="page-title text-[26px]">Categorias de chamado</h1>
              <p className="page-copy max-w-md">Cadastre categorias reutilizáveis nos tipos de chamado.</p>
            </div>
          </div>
          <Button onClick={() => setCreateOpen(true)}><Plus /> Nova categoria</Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard icon={Tags} label="Categorias" value={stats.total} tone="blue" />
        <MetricCard icon={CheckCircle2} label="Ativas" value={stats.active} tone="green" />
        <MetricCard icon={Layers} label="Tipos vinculados" value={stats.types} tone="gray" />
      </div>

      <Card className="overflow-hidden rounded-2xl border-0 py-0 shadow-none ring-1 ring-foreground/10">
        {!loading && categories.length === 0 ? (
          <ListEmptyState
            icon={Layers}
            title="Nenhuma categoria cadastrada"
            description="Cadastre categorias para reutilizá-las nos tipos de chamado."
            actionLabel="Nova categoria"
            onAction={() => setCreateOpen(true)}
          />
        ) : (
        <Table>
          <TableHeader><TableRow className="bg-muted/10"><TableHead>Categoria</TableHead><TableHead>Cor</TableHead><TableHead>Tipos</TableHead><TableHead>Status</TableHead><TableHead className="w-28" /></TableRow></TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Carregando...</TableCell></TableRow>
            ) : categories.map((category) => (
              <TableRow key={category.id}>
                <TableCell><div className="flex items-center gap-2"><Layers className="size-4 text-primary" /><span className="font-medium">{category.name}</span></div></TableCell>
                <TableCell><span className="flex items-center gap-2"><ColorSwatch value={category.color} /><span className="text-muted-foreground">{colorMap[category.color]?.label || category.color}</span></span></TableCell>
                <TableCell>{category.type_count || 0}</TableCell>
                <TableCell><Badge variant={category.active ? "success" : "muted"}>{category.active ? "Ativa" : "Inativa"}</Badge></TableCell>
                <TableCell className="space-x-1">
                  <Button size="sm" variant="outline" onClick={() => toggleCategory(category)}>{category.active ? "Desativar" : "Ativar"}</Button>
                  <Button size="icon-sm" variant="ghost" onClick={() => setDeleteTarget(category)} disabled={category.type_count > 0} title={category.type_count > 0 ? "Há tipos usando esta categoria" : "Excluir"}><Trash2 /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        )}
      </Card>

      <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) { setName(""); setColor("blue"); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Nova categoria</DialogTitle></DialogHeader>
          <form className="grid gap-4" onSubmit={createCategory}>
            <div className="space-y-1.5">
              <Label htmlFor="category-name">Nome da categoria</Label>
              <Input id="category-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Redes e conectividade" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="category-color">Cor</Label>
              <Select value={color} onValueChange={setColor}>
                <SelectTrigger id="category-color" className="bg-card">
                  <SelectValue>{(value) => <span className="flex items-center gap-2"><ColorSwatch value={value} />{colorMap[value]?.label || value}</span>}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {colorOptions.map((c) => (
                    <SelectItem key={c.value} value={c.value}><span className="flex items-center gap-2"><ColorSwatch value={c.value} />{c.label}</span></SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
              <Button type="submit"><Plus /> Criar categoria</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir categoria</DialogTitle>
            <DialogDescription>Esta ação não pode ser desfeita.</DialogDescription>
          </DialogHeader>
          <p className="text-sm">Excluir <strong>{deleteTarget?.name}</strong>?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => deleteTarget && removeCategory(deleteTarget)}><Trash2 /> Excluir definitivamente</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
