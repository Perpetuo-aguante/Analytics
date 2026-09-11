// Las métricas por las que se puede rankear y ordenar. Vive aparte de
// queries.ts porque también la consumen componentes cliente (los selectores
// de métrica), que no pueden importar el cliente de Supabase.

import type { CurrentMetric } from "./supabase/types";

export const RANKING_METRICS = [
  { key: "views", label: "Views", column: "views", format: "number" },
  { key: "open_rate", label: "Open rate", column: "open_rate", format: "percent" },
  { key: "new_subscribers", label: "Nuevos subs", column: "new_subscribers", format: "number" },
  { key: "engagement", label: "Engagement", column: "engagement", format: "percent" },
] as const satisfies readonly {
  key: string;
  label: string;
  column: keyof CurrentMetric;
  format: "number" | "percent";
}[];

export type RankingMetric = (typeof RANKING_METRICS)[number];
export type RankingMetricKey = RankingMetric["key"];

export const DEFAULT_METRIC: RankingMetricKey = "views";

export function parseMetric(value: string | undefined): RankingMetric {
  return RANKING_METRICS.find((m) => m.key === value) ?? RANKING_METRICS[0];
}

// Ordena de mayor a menor por la métrica dada, descartando los posts que no
// la tienen. Un null no es un cero: un post sin open_rate registrado no debe
// aparecer al fondo del ranking como si hubiera tenido 0% de aperturas.
export function rankBy<T extends Pick<CurrentMetric, "views" | "open_rate" | "new_subscribers" | "engagement">>(
  rows: T[],
  metric: RankingMetric
): T[] {
  return rows
    .filter((row) => typeof row[metric.column as keyof T] === "number")
    .sort((a, b) => (b[metric.column as keyof T] as number) - (a[metric.column as keyof T] as number));
}
