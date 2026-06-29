"use client";

import { Skeleton } from "@/components/ui/skeleton";

export function ListLoadingSkeleton({ rows = 6 }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-12 w-full rounded-lg" />
      ))}
    </div>
  );
}
