"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, Cpu, HardDrive, LineChart } from "lucide-react";
import { Card } from "@/components/ui/card";

const SERIES = [
  { key: "cpuPercent", label: "CPU", icon: Cpu, color: "var(--chart-1, var(--primary))" },
  { key: "memoryPercent", label: "Memória", icon: Activity, color: "var(--chart-2, var(--destructive))" },
  { key: "diskPercent", label: "Disco", icon: HardDrive, color: "var(--chart-3, var(--secondary-foreground))" },
];

const WIDTH = 280;
const HEIGHT = 80;

// Períodos selecionáveis — o endpoint /metrics aceita ?hours=N.
const PERIODS = [
  { label: "24h", hours: 24 },
  { label: "7 dias", hours: 168 },
  { label: "30 dias", hours: 720 },
];

function buildPath(points, key) {
  const valid = points
    .map((point, index) => ({ index, value: Number(point[key]) }))
    .filter((item) => Number.isFinite(item.value));
  if (valid.length === 0) return "";
  const step = points.length > 1 ? WIDTH / (points.length - 1) : 0;
  return valid
    .map((item, order) => {
      const x = points.length > 1 ? item.index * step : WIDTH / 2;
      const y = HEIGHT - (Math.min(100, Math.max(0, item.value)) / 100) * HEIGHT;
      return `${order === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function formatTime(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function AssetMetricsChart({ assetId }) {
  const [metrics, setMetrics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hours, setHours] = useState(24);

  useEffect(() => {
    let ignore = false;
    async function load() {
      if (!assetId) {
        setMetrics([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      const response = await fetch(`/api/assets/${assetId}/metrics?hours=${hours}`, { cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (!ignore) {
        setMetrics(response.ok ? result.metrics || [] : []);
        setLoading(false);
      }
    }
    load();
    return () => { ignore = true; };
  }, [assetId, hours]);

  const latest = useMemo(() => metrics[metrics.length - 1] || null, [metrics]);

  if (!assetId) return null;

  return <Card className="rounded-xl py-0 shadow-none">
    <div className="flex items-center justify-between gap-3 border-b p-5">
      <p className="flex items-center gap-2 font-heading text-sm font-bold"><LineChart className="size-4 text-muted-foreground" />Histórico de telemetria</p>
      <div className="flex items-center gap-1 rounded-lg bg-muted/60 p-0.5">
        {PERIODS.map((period) => (
          <button
            key={period.hours}
            type="button"
            onClick={() => setHours(period.hours)}
            className={`rounded-md px-2 py-1 text-[11px] font-medium transition ${hours === period.hours ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            {period.label}
          </button>
        ))}
      </div>
    </div>
    <div className="space-y-4 p-5 text-xs">
      {loading ? (
        <p className="text-muted-foreground">Carregando histórico...</p>
      ) : metrics.length === 0 ? (
        <p className="text-muted-foreground">Sem pontos de telemetria no período. Aguardando heartbeats do agente.</p>
      ) : (
        <>
          <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-20 w-full" preserveAspectRatio="none" role="img" aria-label="Histórico de CPU, memória e disco">
            {[0, 0.5, 1].map((ratio) => (
              <line key={ratio} x1="0" x2={WIDTH} y1={HEIGHT * ratio} y2={HEIGHT * ratio} stroke="var(--border)" strokeWidth="1" strokeDasharray="2 3" />
            ))}
            {SERIES.map((serie) => (
              <path key={serie.key} d={buildPath(metrics, serie.key)} fill="none" stroke={serie.color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            ))}
          </svg>
          <div className="flex flex-wrap gap-3">
            {SERIES.map((serie) => {
              const Icon = serie.icon;
              const value = latest ? Number(latest[serie.key]) : null;
              return <span key={serie.key} className="flex items-center gap-1.5">
                <span className="inline-block size-2 rounded-full" style={{ backgroundColor: serie.color }} />
                <Icon className="size-3.5 text-muted-foreground" />
                <span className="font-medium">{serie.label}</span>
                <span className="text-muted-foreground">{Number.isFinite(value) ? `${Math.round(value)}%` : "N/D"}</span>
              </span>;
            })}
          </div>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{formatTime(metrics[0]?.collectedAt)}</span>
            <span>{metrics.length} ponto(s)</span>
            <span>{formatTime(latest?.collectedAt)}</span>
          </div>
        </>
      )}
    </div>
  </Card>;
}
