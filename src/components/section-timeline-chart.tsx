"use client";

// Serie histórica por tipo de post. Es MultiLineChart con las series atadas
// a las categorías: el color y la forma de cada tipo son los mismos que en
// el resto de la app, y la leyenda muestra la forma además del color.

import type { Category } from "@/lib/categories";
import { MarkerShapeIcon } from "./marker-shape";
import { MultiLineChart } from "./multi-line-chart";

export type TimelineSeries = {
  category: Category;
  points: { date: string; value: number | null }[];
};

export function SectionTimelineChart({
  series,
  percent = false,
  height = 280,
  title = "Serie histórica por sección",
}: {
  series: TimelineSeries[];
  percent?: boolean;
  height?: number;
  title?: string;
  width?: number;
}) {
  return (
    <MultiLineChart
      title={title}
      percent={percent}
      height={height}
      series={series.map((s) => ({
        key: s.category.id,
        label: s.category.name,
        color: s.category.color,
        points: s.points,
      }))}
      legend={series.map((s) => ({
        key: s.category.id,
        label: s.category.name,
        color: s.category.color,
        swatch: (
          <svg width={12} height={12} viewBox="0 0 12 12" aria-hidden>
            <MarkerShapeIcon shape={s.category.shape} cx={6} cy={6} size={9} color={s.category.color} />
          </svg>
        ),
      }))}
    />
  );
}
