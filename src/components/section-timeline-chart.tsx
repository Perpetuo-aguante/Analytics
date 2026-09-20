"use client";

import { useId, useMemo, useRef, useState } from "react";
import { niceTicks } from "@/lib/chart-scale";
import type { Category } from "@/lib/categories";

export type TimelineSeries = {
  category: Category;
  points: { date: string; value: number | null }[];
};

export function SectionTimelineChart({
  series,
  percent = false,
  width = 640,
  height = 280,
}: {
  series: TimelineSeries[];
  percent?: boolean;
  width?: number;
  height?: number;
}) {
  const titleId = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const allDates = useMemo(() => {
    const set = new Set<string>();
    for (const s of series) for (const p of s.points) if (p.value != null) set.add(p.date);
    return Array.from(set).sort();
  }, [series]);

  const padding = { top: 16, right: 132, bottom: 28, left: 56 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const stepX = allDates.length > 1 ? innerWidth / (allDates.length - 1) : 0;
  const xForDate = (date: string) => padding.left + allDates.indexOf(date) * stepX;

  const visibleSeries = series.filter((s) => !hidden.has(s.category.id));
  const allValues = visibleSeries.flatMap((s) => s.points.map((p) => p.value).filter((v): v is number => v != null));
  // Igual que en el scatter: el tope sale de los datos. Un piso de 1 mandaba
  // el eje de open rate hasta 100% y dejaba todas las series aplastadas abajo.
  const dataMax = allValues.length > 0 ? Math.max(...allValues) : 0;
  const yTicks = niceTicks(0, dataMax > 0 ? dataMax : 1, 4);
  const yMax = yTicks[yTicks.length - 1];
  const yForValue = (v: number) => padding.top + innerHeight - (v / yMax) * innerHeight;

  const formatValue = (v: number) => (percent ? `${(v * 100).toFixed(1)}%` : Math.round(v).toLocaleString("es"));

  function toggle(categoryId: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  }

  function handleMove(e: React.MouseEvent<SVGRectElement>) {
    if (allDates.length === 0 || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * width;
    const idx = stepX > 0 ? Math.round((relX - padding.left) / stepX) : 0;
    setHoverIndex(Math.min(allDates.length - 1, Math.max(0, idx)));
  }

  // Declutter de las etiquetas del extremo derecho: si dos series terminan
  // muy cerca en Y, se separan verticalmente para que no se pisen.
  const endLabels = useMemo(() => {
    const items = visibleSeries
      .map((s) => {
        const last = [...s.points].reverse().find((p) => p.value != null);
        if (!last || last.value == null) return null;
        return { category: s.category, value: last.value, y: yForValue(last.value) };
      })
      .filter((i): i is { category: Category; value: number; y: number } => i != null)
      .sort((a, b) => a.y - b.y);

    for (let i = 1; i < items.length; i++) {
      const minGap = 13;
      if (items[i].y - items[i - 1].y < minGap) items[i].y = items[i - 1].y + minGap;
    }
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleSeries, yMax]);

  return (
    <div className="w-full">
      <div className="relative">
        <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} className="w-full text-ink" role="img" aria-labelledby={titleId}>
          <title id={titleId}>Serie histórica por sección</title>

          {yTicks.map((t) => (
            <g key={t}>
              <line x1={padding.left} y1={yForValue(t)} x2={width - padding.right} y2={yForValue(t)} stroke="var(--line)" />
              <text x={padding.left - 8} y={yForValue(t)} dy={3} fontSize={11} fill="var(--axis-ink)" textAnchor="end">
                {formatValue(t)}
              </text>
            </g>
          ))}

          {visibleSeries.map((s) => {
            const style = s.category;
            const coords = s.points
              .filter((p): p is { date: string; value: number } => p.value != null)
              .map((p) => ({ x: xForDate(p.date), y: yForValue(p.value) }));
            const path = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(" ");
            return (
              <g key={s.category.id}>
                <path d={path} fill="none" stroke={style.color} strokeWidth={2} />
                {coords.map((c, i) => (
                  <circle key={i} cx={c.x} cy={c.y} r={3} fill={style.color} stroke="var(--surface)" strokeWidth={2} />
                ))}
              </g>
            );
          })}

          {endLabels.map((item) => (
            <text key={item.category.id} x={width - padding.right + 8} y={item.y} dy={3} fontSize={11} fill="var(--ink-secondary)">
              <tspan fill={item.category.color}>● </tspan>
              {item.category.name}
            </text>
          ))}

          {hoverIndex != null && allDates[hoverIndex] && (
            <line
              x1={padding.left + hoverIndex * stepX}
              y1={padding.top}
              x2={padding.left + hoverIndex * stepX}
              y2={height - padding.bottom}
              stroke="var(--line-strong)"
            />
          )}

          <rect
            x={padding.left}
            y={padding.top}
            width={innerWidth}
            height={innerHeight}
            fill="transparent"
            onMouseMove={handleMove}
            onMouseLeave={() => setHoverIndex(null)}
          />

          {allDates.length > 0 && (
            <>
              <text x={padding.left} y={height - 6} fontSize={11} fill="var(--axis-ink)">
                {allDates[0]}
              </text>
              <text x={width - padding.right} y={height - 6} fontSize={11} fill="var(--axis-ink)" textAnchor="end">
                {allDates[allDates.length - 1]}
              </text>
            </>
          )}
        </svg>

        {hoverIndex != null && allDates[hoverIndex] && (
          <div
            className="pointer-events-none absolute top-2 z-10 -translate-x-1/2 rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-lg"
            style={{ left: `${(xForDate(allDates[hoverIndex]) / width) * 100}%` }}
          >
            <p className="font-medium">{allDates[hoverIndex]}</p>
            {visibleSeries.map((s) => {
              const point = s.points.find((p) => p.date === allDates[hoverIndex]);
              return (
                // El valor va primero y en alto contraste: quien mira el
                // tooltip ya sabe qué serie es, lo que busca es el número.
                <p key={s.category.id} className="tnum mt-0.5 flex items-baseline gap-1.5 text-ink-muted">
                  <span aria-hidden style={{ color: s.category.color }}>●</span>
                  <span className="font-semibold text-ink">
                    {point?.value != null ? formatValue(point.value) : "—"}
                  </span>
                  <span>{s.category.name}</span>
                </p>
              );
            })}
          </div>
        )}
      </div>

      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
        {series.map((s) => {
          const isHidden = hidden.has(s.category.id);
          return (
            <li key={s.category.id}>
              <button
                type="button"
                onClick={() => toggle(s.category.id)}
                aria-pressed={!isHidden}
                className={`chip ${isHidden ? "opacity-40" : ""}`}
              >
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: s.category.color }} />
                {s.category.name}
              </button>
            </li>
          );
        })}
      </ul>

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-ink-muted hover:text-ink">Ver como tabla</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[480px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left text-ink-muted">
                <th className="px-2 py-2 font-medium">Fecha</th>
                {series.map((s) => (
                  <th key={s.category.id} className="px-2 py-2 font-medium">
                    {s.category.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allDates.map((date) => (
                <tr key={date} className="border-b border-line/60">
                  <td className="px-2 py-2">{date}</td>
                  {series.map((s) => {
                    const point = s.points.find((p) => p.date === date);
                    return (
                      <td key={s.category.id} className="px-2 py-2">
                        {point?.value != null ? formatValue(point.value) : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
