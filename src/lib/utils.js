import { clsx } from "clsx";
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/** Formata percentual com arredondamento estável (evita 7.700000000000003%). */
export function formatPercent(value, decimals = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const factor = 10 ** decimals;
  return `${Math.round(n * factor) / factor}%`;
}

/** Tempo relativo curto em pt-BR ("Há 5 min", "Há 3h", "Há 2d"). `fallback` para data ausente. */
export function timeAgo(date, fallback = "Nunca") {
  if (!date) return fallback;
  const minutes = Math.max(1, Math.round((Date.now() - new Date(date).getTime()) / 60000));
  if (minutes < 60) return `Há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Há ${hours}h`;
  return `Há ${Math.round(hours / 24)}d`;
}
