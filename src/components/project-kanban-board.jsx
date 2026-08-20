"use client";

import { useState } from "react";
import { GripVertical, MessageSquare, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { statusColorHex } from "@/lib/status-colors";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const priorityLabels = { BAIXA: "Baixa", MEDIA: "Média", ALTA: "Alta", CRITICA: "Crítica" };
const priorityHigh = new Set(["ALTA", "CRITICA"]);

function initials(name = "Tarefa") {
  return name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase();
}

function TaskCard({ task, draggable, dragging, onOpen, onDragStart, onDragEnd }) {
  const overdue = task.due_date && task.due_date < new Date().toISOString().slice(0, 10) && !task.column_is_done;
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

// Quadro Kanban das tarefas do projeto: colunas configuráveis por quadro (Configurações
// ficam embutidas aqui mesmo — sem tela separada, já que só fazem sentido no contexto do
// quadro). Drag-and-drop HTML5 nativo, mesmo padrão do quadro de chamados. Arrastar um
// cartão move a tarefa de coluna; arrastar pelo "grip" do cabeçalho reordena a própria
// coluna — os dois usam o mesmo mecanismo nativo, distinguidos por qual dragging* está setado.
export function ProjectKanbanBoard({ tasks, columns, canManage, onOpenTask, onMoveTask, onCreateColumn, onEditColumn, onDeleteColumn, onReorderColumns }) {
  const [draggingId, setDraggingId] = useState(null);
  const [overId, setOverId] = useState(null);
  const [draggingColumnId, setDraggingColumnId] = useState(null);
  const [overColumnId, setOverColumnId] = useState(null);

  function handleDragStart(event, task) {
    if (!canManage) return;
    setDraggingId(task.id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", task.id);
  }
  function handleDragEnd() {
    setDraggingId(null);
    setOverId(null);
  }
  function handleColumnDragStart(event, column) {
    if (!canManage) return;
    event.stopPropagation();
    setDraggingColumnId(column.id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", column.id);
  }
  function handleColumnDragEnd() {
    setDraggingColumnId(null);
    setOverColumnId(null);
  }
  function handleDragOver(event, column) {
    if (!canManage) return;
    event.preventDefault();
    if (draggingColumnId) setOverColumnId(column.id);
    else setOverId(column.id);
  }
  function handleDragLeave(column) {
    setOverId((current) => (current === column.id ? null : current));
    setOverColumnId((current) => (current === column.id ? null : current));
  }
  function handleDrop(event, column) {
    event.preventDefault();
    if (draggingColumnId) {
      const sourceId = draggingColumnId;
      setDraggingColumnId(null);
      setOverColumnId(null);
      if (sourceId === column.id) return;
      const order = columns.map((c) => c.id);
      const fromIndex = order.indexOf(sourceId);
      const toIndex = order.indexOf(column.id);
      if (fromIndex === -1 || toIndex === -1) return;
      order.splice(fromIndex, 1);
      order.splice(toIndex, 0, sourceId);
      onReorderColumns?.(order);
      return;
    }
    setOverId(null);
    const id = event.dataTransfer.getData("text/plain") || draggingId;
    setDraggingId(null);
    if (!id || !canManage) return;
    const task = tasks.find((item) => item.id === id);
    if (!task || task.column_id === column.id) return;
    onMoveTask?.(task, column);
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {columns.map((column) => {
        const items = tasks.filter((task) => task.column_id === column.id);
        const dotColor = statusColorHex(column.color) || "#94a3b8";
        return (
          <div
            key={column.id}
            onDragOver={(event) => handleDragOver(event, column)}
            onDragLeave={() => handleDragLeave(column)}
            onDrop={(event) => handleDrop(event, column)}
            className={`flex w-72 shrink-0 flex-col rounded-2xl border bg-muted/20 transition-colors ${draggingColumnId === column.id ? "opacity-40" : ""} ${overId === column.id || overColumnId === column.id ? "border-primary/50 bg-primary/5" : "border-border/60"}`}
          >
            <div
              draggable={canManage}
              onDragStart={(event) => handleColumnDragStart(event, column)}
              onDragEnd={handleColumnDragEnd}
              className={`flex items-center gap-2 border-b border-border/60 px-3 py-2.5 ${canManage ? "cursor-grab active:cursor-grabbing" : ""}`}
            >
              {canManage && <GripVertical className="size-3.5 shrink-0 text-muted-foreground/40" aria-hidden="true" />}
              <i className="size-2 shrink-0 rounded-full" style={{ backgroundColor: dotColor }} aria-hidden="true" />
              <p className="truncate text-xs font-semibold">{column.label}</p>
              <Badge variant="secondary" className="ml-auto shrink-0 px-1.5 text-[10px] tabular-nums">{items.length}</Badge>
              {canManage && (
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" className="shrink-0" aria-label={`Ações da coluna ${column.label}`} />}><MoreVertical /></DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEditColumn(column)}><Pencil /> Editar coluna</DropdownMenuItem>
                    {columns.length > 1 && <DropdownMenuItem variant="destructive" onClick={() => onDeleteColumn(column)}><Trash2 /> Excluir coluna</DropdownMenuItem>}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
            <div className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto p-2.5">
              {items.length === 0 ? (
                <p className="px-2 py-6 text-center text-[11px] text-muted-foreground">Nenhuma tarefa</p>
              ) : items.map((task) => (
                <TaskCard key={task.id} task={task} draggable={canManage} dragging={draggingId === task.id} onOpen={onOpenTask} onDragStart={handleDragStart} onDragEnd={handleDragEnd} />
              ))}
            </div>
          </div>
        );
      })}
      {canManage && (
        <button
          type="button"
          onClick={onCreateColumn}
          className="flex h-11 w-64 shrink-0 items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border/60 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
        >
          <Plus className="size-3.5" /> Nova coluna
        </button>
      )}
    </div>
  );
}
