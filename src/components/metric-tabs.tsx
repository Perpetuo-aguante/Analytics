"use client";

// Selector de la métrica por la que se rankea/ordena. Escribe en la URL igual
// que la barra de filtros, así que se combina con ella sin estado compartido:
// "?rango=30&tipo=anteojos-editorial&metrica=open_rate" es exactamente la
// pregunta "¿qué Anteojos tuvo mejor open rate el último mes?".

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { RANKING_METRICS, type RankingMetricKey } from "@/lib/metrics";

export function MetricTabs({ active, label = "Ordenar por" }: { active: RankingMetricKey; label?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function select(key: RankingMetricKey) {
    const params = new URLSearchParams(searchParams.toString());
    if (key === RANKING_METRICS[0].key) params.delete("metrica");
    else params.set("metrica", key);
    const qs = params.toString();
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  return (
    <div
      data-pending={isPending ? "true" : undefined}
      className="mb-6 flex flex-wrap items-center gap-2 transition-opacity data-[pending=true]:opacity-60"
    >
      <span className="mr-1 text-xs font-semibold uppercase tracking-wider text-ink-muted">{label}</span>
      {RANKING_METRICS.map((metric) => (
        <button
          key={metric.key}
          type="button"
          onClick={() => select(metric.key)}
          className="chip"
          data-active={metric.key === active}
          aria-pressed={metric.key === active}
        >
          {metric.label}
        </button>
      ))}
    </div>
  );
}
