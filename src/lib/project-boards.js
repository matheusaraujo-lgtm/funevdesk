import { makeId } from "@/lib/db";

const DEFAULT_BOARD_COLUMNS = [
  { label: "A fazer", color: "slate", isDone: 0 },
  { label: "Em andamento", color: "amber", isDone: 0 },
  { label: "Concluído", color: "green", isDone: 1 },
];

// Semeia as 3 colunas padrão (A fazer/Em andamento/Concluído) num quadro recém-criado —
// mesma base que a migração de backfill usa, pra um quadro novo nunca nascer vazio.
export function seedDefaultColumns(db, boardId) {
  const now = new Date().toISOString();
  DEFAULT_BOARD_COLUMNS.forEach((column, index) => {
    db.prepare("INSERT INTO project_board_columns (id, board_id, label, color, position, is_done, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(makeId("pbc"), boardId, column.label, column.color, index, column.isDone, now, now);
  });
}

// Quadros do projeto com as colunas de cada um já aninhadas — evita round-trip extra pro
// front-end montar o quadro (tabs de quadro + colunas do quadro ativo) numa carga só.
export function loadBoardsWithColumns(db, projectId) {
  const boards = db.prepare("SELECT * FROM project_boards WHERE project_id=? ORDER BY position ASC, created_at ASC").all(projectId);
  const columns = db.prepare(`
    SELECT c.* FROM project_board_columns c
    JOIN project_boards b ON b.id = c.board_id
    WHERE b.project_id=?
    ORDER BY c.position ASC, c.created_at ASC
  `).all(projectId);
  return boards.map((board) => ({ ...board, columns: columns.filter((column) => column.board_id === board.id) }));
}
