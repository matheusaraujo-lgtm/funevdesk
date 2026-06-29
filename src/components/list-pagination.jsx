"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const DEFAULT_PAGE_SIZES = [10, 25, 50];

export function useListPagination(totalItems, defaultPageSize = 10) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize) || 1);

  useEffect(() => {
    // Mantém a página dentro do total ao reduzir a lista (ex.: após excluir itens).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    // Volta à primeira página ao trocar o tamanho de página ou o conjunto de itens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1);
  }, [totalItems, pageSize]);

  const start = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);

  function sliceItems(items) {
    return items.slice((page - 1) * pageSize, page * pageSize);
  }

  return { page, setPage, pageSize, setPageSize, totalPages, start, end, sliceItems };
}

export function ListPagination({
  totalItems,
  page,
  pageSize,
  totalPages,
  start,
  end,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_PAGE_SIZES,
  itemLabel = "itens",
  showPageSize = false,
  className = "",
}) {
  if (totalItems === 0) return null;

  const maxVisible = 5;
  let startPage = Math.max(1, page - Math.floor(maxVisible / 2));
  let endPage = Math.min(totalPages, startPage + maxVisible - 1);
  startPage = Math.max(1, endPage - maxVisible + 1);
  const pages = [];
  for (let index = startPage; index <= endPage; index += 1) pages.push(index);

  return (
    <div className={`flex flex-col gap-3 border-t px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center ${className}`}>
      <p>Mostrando {start}-{end} de {totalItems} {itemLabel}</p>
      {totalPages > 1 && (
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" className="size-8" disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label="Página anterior">
            <ChevronLeft />
          </Button>
          {pages.map((pageNumber) => (
            <Button
              key={pageNumber}
              variant={pageNumber === page ? "default" : "ghost"}
              size="icon"
              className="size-8"
              onClick={() => onPageChange(pageNumber)}
              aria-label={`Página ${pageNumber}`}
              aria-current={pageNumber === page ? "page" : undefined}
            >
              {pageNumber}
            </Button>
          ))}
          <Button variant="ghost" size="icon" className="size-8" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} aria-label="Próxima página">
            <ChevronRight />
          </Button>
        </div>
      )}
      {showPageSize && onPageSizeChange && (
        <Select value={String(pageSize)} onValueChange={(value) => onPageSizeChange(Number(value))}>
          <SelectTrigger className="h-8 w-[130px] bg-card text-xs"><SelectValue>{(value) => `${value} por página`}</SelectValue></SelectTrigger>
          <SelectContent>
            {pageSizeOptions.map((size) => (
              <SelectItem key={size} value={String(size)}>{size} por página</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
