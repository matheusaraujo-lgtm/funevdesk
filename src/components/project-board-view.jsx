"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, CalendarDays, MessageSquare, Pencil, Plus, Send, Trash2, User } from "lucide-react";
import { toast } from "sonner";
import { useReloadableData } from "@/lib/use-reloadable-data";
import { ProjectKanbanBoard } from "@/components/project-kanban-board";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

const statusLabels = { PLANEJAMENTO: "Planejamento", EM_ANDAMENTO: "Em andamento", PAUSADO: "Pausado", PENDENTE: "Pendente", CONCLUIDO: "Concluído", CANCELADO: "Cancelado" };
const statusVariants = { PLANEJAMENTO: "secondary", EM_ANDAMENTO: "warning", PAUSADO: "muted", PENDENTE: "destructive", CONCLUIDO: "success", CANCELADO: "destructive" };
const priorityLabels = { BAIXA: "Baixa", MEDIA: "Média", ALTA: "Alta", CRITICA: "Crítica" };

function initials(name = "Usuário") {
  return name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase();
}

function TaskComments({ projectId, taskId, onPosted }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/${projectId}/tasks/${taskId}/comments`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { comments: [] }))
      .then((data) => { if (!cancelled) setComments(data.comments || []); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId, taskId]);

  async function send() {
    if (!body.trim()) return toast.error("Escreva um comentário.");
    setSending(true);
    const response = await fetch(`/api/projects/${projectId}/tasks/${taskId}/comments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body }),
    });
    const result = await response.json();
    setSending(false);
    if (!response.ok) return toast.error(result.error || "Não foi possível comentar.");
    setBody("");
    setComments(result.comments);
    onPosted?.();
  }

  return (
    <div>
      <h3 className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        <MessageSquare className="size-3.5" /> Comentários{comments.length > 0 ? ` (${comments.length})` : ""}
      </h3>
      <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
        {loading ? (
          <p className="py-2 text-center text-xs text-muted-foreground">Carregando…</p>
        ) : comments.length === 0 ? (
          <p className="py-2 text-center text-xs text-muted-foreground">Nenhum comentário ainda.</p>
        ) : (
          <div className="mb-3 max-h-40 space-y-3 overflow-y-auto pr-1">
            {comments.map((comment) => (
              <div key={comment.id} className="flex items-start gap-2.5">
                <Avatar className="size-6 shrink-0"><AvatarFallback className="text-[9px]">{initials(comment.author_name)}</AvatarFallback></Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-semibold">{comment.author_name}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{new Date(comment.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-[13px] leading-snug text-foreground/90">{comment.body}</p>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Escreva um comentário..."
            rows={1}
            className="min-h-9 flex-1 resize-none bg-card text-xs"
          />
          <Button type="button" size="icon" className="size-9 shrink-0" disabled={sending} onClick={send} aria-label="Enviar comentário"><Send className="size-4" /></Button>
        </div>
      </div>
    </div>
  );
}

function emptyTaskForm() {
  return { title: "", description: "", priority: "MEDIA", assigneeId: "none", dueDate: "" };
}

function TaskDialog({ task, users, onClose, onSaved, onDeleted, onCommentPosted }) {
  const isEdit = Boolean(task?.id);
  const [form, setForm] = useState(() => isEdit ? {
    title: task.title, description: task.description || "", priority: task.priority,
    assigneeId: task.assignee_id || "none", dueDate: task.due_date?.slice(0, 10) || "",
  } : emptyTaskForm());
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (form.title.trim().length < 2) return toast.error("Informe o título da tarefa.");
    setSubmitting(true);
    const payload = {
      title: form.title,
      description: form.description,
      priority: form.priority,
      assigneeId: form.assigneeId === "none" ? null : form.assigneeId,
      dueDate: form.dueDate || null,
    };
    const response = await fetch(isEdit ? `/api/projects/${task.project_id}/tasks/${task.id}` : `/api/projects/${task.projectId}/tasks`, {
      method: isEdit ? "PUT" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    setSubmitting(false);
    if (!response.ok) return toast.error(result.error || "Não foi possível salvar a tarefa.");
    toast.success(isEdit ? "Tarefa atualizada." : "Tarefa criada.");
    onSaved(result.tasks);
    onClose();
  }

  async function remove() {
    const response = await fetch(`/api/projects/${task.project_id}/tasks/${task.id}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) return toast.error(result.error || "Não foi possível excluir.");
    toast.success("Tarefa excluída.");
    onDeleted(result.tasks);
    onClose();
  }

  return (
    <>
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 sm:max-w-xl">
        <DialogHeader className="shrink-0 pb-3"><DialogTitle>{isEdit ? "Editar tarefa" : "Nova tarefa"}</DialogTitle></DialogHeader>
        <div className="-mx-4 flex-1 space-y-5 overflow-y-auto px-4">
          <form id="task-form" className="space-y-4" onSubmit={submit}>
            <div><Label htmlFor="task-title" className="mb-2 block">Título</Label><Input id="task-title" value={form.title} onChange={(e) => setForm((c) => ({ ...c, title: e.target.value }))} placeholder="Ex.: Levantar inventário atual" /></div>
            <div><Label htmlFor="task-description" className="mb-2 block">Descrição</Label><Textarea id="task-description" rows={3} value={form.description} onChange={(e) => setForm((c) => ({ ...c, description: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label htmlFor="task-priority" className="mb-2 block">Prioridade</Label><Select value={form.priority} onValueChange={(v) => setForm((c) => ({ ...c, priority: v }))}><SelectTrigger id="task-priority" aria-label="Prioridade"><SelectValue>{(value) => priorityLabels[value]}</SelectValue></SelectTrigger><SelectContent>{Object.entries(priorityLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
              <div><Label htmlFor="task-due" className="mb-2 block">Prazo</Label><Input id="task-due" type="date" value={form.dueDate} onChange={(e) => setForm((c) => ({ ...c, dueDate: e.target.value }))} /></div>
            </div>
            <div><Label htmlFor="task-assignee" className="mb-2 block">Responsável</Label><Select value={form.assigneeId} onValueChange={(v) => setForm((c) => ({ ...c, assigneeId: v }))}><SelectTrigger id="task-assignee" aria-label="Responsável"><SelectValue placeholder="Nenhum">{(value) => value === "none" ? "Nenhum" : users.find((user) => user.id === value)?.name}</SelectValue></SelectTrigger><SelectContent><SelectItem value="none">Nenhum</SelectItem>{users.filter((u) => u.active).map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent></Select></div>
          </form>
          {isEdit && <><Separator /><TaskComments projectId={task.project_id} taskId={task.id} onPosted={onCommentPosted} /></>}
        </div>
        <DialogFooter className="mt-3 shrink-0 gap-2">
          {isEdit && <Button type="button" variant="destructive" className="mr-auto" onClick={() => setConfirmOpen(true)}><Trash2 /> Excluir</Button>}
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="task-form" disabled={submitting}>{isEdit ? "Salvar" : "Criar tarefa"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <ConfirmDialog open={confirmOpen} onOpenChange={setConfirmOpen} title="Excluir tarefa" description={`Excluir "${task?.title}"?`} onConfirm={() => { setConfirmOpen(false); remove(); }} />
    </>
  );
}

export function ProjectBoardView({ item, users, can, onBack, onEdit, onDeleted }) {
  const [project, setProject] = useState(item);
  const [tasks, setTasks] = useState(item?.tasks || []);
  const [taskDraft, setTaskDraft] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const { loading } = useReloadableData(useCallback(async () => {
    if (!item?.id) return;
    const response = await fetch(`/api/projects/${item.id}`, { cache: "no-store" });
    if (response.ok) {
      const payload = await response.json();
      setProject(payload.project);
      setTasks(payload.project.tasks || []);
    }
  }, [item]));

  const canManage = can ? can("projects", "update") : false;
  const canDelete = can ? can("projects", "delete") : false;

  function bumpTaskCommentCount(taskId) {
    setTasks((current) => current.map((t) => (t.id === taskId ? { ...t, comment_count: (t.comment_count || 0) + 1 } : t)));
  }

  async function moveTask(task, column) {
    setTasks((current) => current.map((t) => (t.id === task.id ? { ...t, status: column.code } : t)));
    const response = await fetch(`/api/projects/${project.id}/tasks/${task.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: column.code }),
    });
    const result = await response.json();
    if (!response.ok) { toast.error(result.error || "Não foi possível mover a tarefa."); return; }
    setTasks(result.tasks);
  }

  async function removeProject() {
    const response = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) return toast.error(result.error || "Não foi possível excluir.");
    toast.success("Projeto excluído.");
    onDeleted?.();
    onBack();
  }

  if (!project) return null;
  const doneCount = tasks.filter((t) => t.status === "CONCLUIDO").length;
  const pct = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0;

  return (
    <div className="space-y-5 pb-6">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/[0.07] via-card to-secondary/25 px-5 py-5 ring-1 ring-foreground/10 sm:px-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div className="flex items-start gap-3.5">
            <Button type="button" variant="outline" size="icon" className="mt-0.5 bg-card/70" onClick={onBack} aria-label="Voltar"><ArrowLeft /></Button>
            <div>
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <h1 className="page-title text-[26px]">{project.name}</h1>
                <Badge variant={statusVariants[project.status] || "secondary"}>{statusLabels[project.status] || project.status}</Badge>
              </div>
              {project.description && <p className="page-copy max-w-xl">{project.description}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1"><User className="size-3.5" />{project.owner_name || "Sem responsável"}</span>
                {project.due_date && <span className="inline-flex items-center gap-1"><CalendarDays className="size-3.5" />Prazo {new Date(project.due_date).toLocaleDateString("pt-BR")}</span>}
                <span>{priorityLabels[project.priority] || project.priority}</span>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            {canManage && <Button variant="outline" className="bg-card/70" onClick={() => onEdit(project)}><Pencil /> Editar</Button>}
            {canDelete && <Button variant="outline" className="bg-card/70 text-destructive hover:text-destructive" onClick={() => setDeleteConfirm(true)}><Trash2 /> Excluir</Button>}
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Progress value={pct} className="h-1.5 max-w-xs" />
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{doneCount}/{tasks.length} tarefas · {pct}%</span>
        </div>
      </div>

      {project.status === "PENDENTE" && project.pending_reason && (
        <div className="flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-semibold">Projeto pendente</p>
            <p className="text-destructive/90">{project.pending_reason}</p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">Quadro de tarefas</h2>
        {canManage && <Button size="sm" onClick={() => setTaskDraft({ projectId: project.id })}><Plus /> Nova tarefa</Button>}
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <ProjectKanbanBoard tasks={tasks} canDrag={canManage} onOpenTask={setTaskDraft} onMoveTask={moveTask} />
      )}

      {taskDraft && (
        <TaskDialog
          key={taskDraft.id || "new"}
          task={taskDraft}
          users={users}
          onClose={() => setTaskDraft(null)}
          onSaved={setTasks}
          onDeleted={setTasks}
          onCommentPosted={() => bumpTaskCommentCount(taskDraft.id)}
        />
      )}

      <ConfirmDialog
        open={deleteConfirm}
        onOpenChange={setDeleteConfirm}
        title="Excluir projeto"
        description={`Excluir "${project.name}"? As tarefas do projeto também serão removidas.`}
        onConfirm={() => { setDeleteConfirm(false); removeProject(); }}
      />
    </div>
  );
}
