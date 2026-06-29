"use client";

import { Button } from "@/components/ui/button";

export function ListEmptyState({ icon: Icon, title, description, actionLabel, onAction }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      {Icon && (
        <div className="mb-4 grid size-12 place-items-center rounded-xl bg-muted">
          <Icon className="size-6 text-muted-foreground" />
        </div>
      )}
      <p className="font-medium">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {actionLabel && onAction && (
        <Button className="mt-4" size="sm" onClick={onAction}>{actionLabel}</Button>
      )}
    </div>
  );
}
