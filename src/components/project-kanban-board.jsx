"use client";

import { useState } from "react";
import { GripVertical, MessageSquare } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

const priorityLabels = { BAIXA: "Baixa", MEDIA: "Média", ALTA: "Alta", CRITICA: "Crítica" };
const priorityHigh = new Set(["ALTA", "CRITICA"]);

const COLUMNS = [
  { code: "A_FAZER", label: "A fazer", dot: "#94a3b8" },
  { code: "EM_ANDAMENTO", label: "Em andamento", dot: "#f59e0b" },
  { code: "CONCLUIDO", label: "Concluído", dot: "#22c55e" },
];

function initials(name = "Tarefa") {
  return name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase();
}

function TaskCard({ task, draggable, dragging, onOpen, onDragStart, onDragEnd }) {
  const overdue = task.due_date && task.due_date < new Date().toISOString().slice(0, 10) && task.status !== "CONCLUIDO";
  return (
    <div
      draggable={draggable}
      onDragStart={(event) => onDragStart(event, task)}
      onDragEnd={onDragEnd}
      onClick={() => onOpen(task)}
      className={`group cursor-pointer rounded-xl border border-border/60 bg-card p-3 shadow-xs transition hover:border-primary/40 hover:shadow-sm ${dragging ? "opacity-40" : ""} ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          <i className={`size-1.5 rounded-full ${priorityHigh.has(task.priority) ? "bg-destructive" : task.priority === "MEDIA" ? "bg-primary" : "bg-muted-foreground"}`} />
          {priorityLabels[task.priority] || task.priority}
        </span>
        {draggable && <GripVertical className="size-3.5 shrink-0 text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />}
      </div>
      <p className="mb-2 line-clamp-2 text-[13px] font-medium leading-snug">{task.title}</p>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {task.assignee_name ? (
            <>
              <Avatar className="size-5 shrink-0"><AvatarFallback className="text-[9px]">{initials(task.assignee_name)}</AvatarFallback></Avatar>
              <span className="truncate text-[11px] text-muted-foreground">{task.assignee_name}</span>
            </>
          ) : <span className="text-[11px] text-muted-foreground">Sem responsável</span>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {Boolean(task.comment_count) && (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground"><MessageSquare className="size-3" />{task.comment_count}</span>
          )}
          {task.due_date && <Badge variant={overdue ? "destructive" : "muted"} className="h-[18px] shrink-0 px-1.5 text-[10px]">{new Date(task.due_date).toLocaleDateString("pt-BR")}</Badge>}
        </div>
      </div>
    </div>
  );
}

// Quadro Kanban das tarefas do projeto: 3 colunas fixas (A fazer/Em andamento/Concluído).
// Drag-and-drop HTML5 nativo, mesmo padrão do quadro de chamados (sem dependência extra).
export function ProjectKanbanBoard({ tasks, canDrag, onOpenTask, onMoveTask }) {
  const [draggingId, setDraggingId] = useState(null);
  const [overCode, setOverCode] = useState(null);

  function handleDragStart(event, task) {
    if (!canDrag) return;
    setDraggingId(task.id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", task.id);
  }
  function handleDragEnd() {
    setDraggingId(null);
    setOverCode(null);
  }
  function handleDrop(event, column) {
    event.preventDefault();
    setOverCode(null);
    const id = event.dataTransfer.getData("text/plain") || draggingId;
    setDraggingId(null);
    if (!id || !canDrag) return;
    const task = tasks.find((item) => item.id === id);
    if (!task || task.status === column.code) return;
    onMoveTask?.(task, column);
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {COLUMNS.map((column) => {
        const items = tasks.filter((task) => task.status === column.code);
        return (
          <div
            key={column.code}
            onDragOver={(event) => { if (canDrag) { event.preventDefault(); setOverCode(column.code); } }}
            onDragLeave={() => setOverCode((current) => (current === column.code ? null : current))}
            onDrop={(event) => handleDrop(event, column)}
            className={`flex w-72 shrink-0 flex-col rounded-2xl border bg-muted/20 transition-colors ${overCode === column.code ? "border-primary/50 bg-primary/5" : "border-border/60"}`}
          >
            <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2.5">
              <i className="size-2 shrink-0 rounded-full" style={{ backgroundColor: column.dot }} aria-hidden="true" />
              <p className="truncate text-xs font-semibold">{column.label}</p>
              <Badge variant="secondary" className="ml-auto shrink-0 px-1.5 text-[10px] tabular-nums">{items.length}</Badge>
            </div>
            <div className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto p-2.5">
              {items.length === 0 ? (
                <p className="px-2 py-6 text-center text-[11px] text-muted-foreground">Nenhuma tarefa</p>
              ) : items.map((task) => (
                <TaskCard key={task.id} task={task} draggable={canDrag} dragging={draggingId === task.id} onOpen={onOpenTask} onDragStart={handleDragStart} onDragEnd={handleDragEnd} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
