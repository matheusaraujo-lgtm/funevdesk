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

/** Converte ISO -> valor de <input type="datetime-local"> (sem segundos/timezone). */
export function toDatetimeLocalValue(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Tempo relativo curto em pt-BR ("Agora mesmo", "Há 5 min", "Há 3h", "Há 2d"). `fallback` para data ausente. */
export function timeAgo(date, fallback = "Nunca") {
  if (!date) return fallback;
  const seconds = Math.round((Date.now() - new Date(date).getTime()) / 1000);
  // Comunicação recente (até ~1 min, incluindo pequeno desvio de relógio) é mostrada de forma
  // direta como "Agora mesmo" — antes qualquer coisa recente virava "Há 1 min".
  if (seconds < 75) return "Agora mesmo";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `Há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Há ${hours}h`;
  return `Há ${Math.round(hours / 24)}d`;
}
