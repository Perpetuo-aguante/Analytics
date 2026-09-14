"use client";

// Serie temporal de varias líneas con leyenda conmutable, crosshair con
// tooltip y vista de tabla. Es el mismo chart que SectionTimelineChart, pero
// con las series como dato (clave, etiqueta y color vienen de quien lo usa)
// en vez de atadas a los siete tipos de post: lo usan los charts de países y
// regiones de /suscriptores/geografia.
//
// La etiqueta al final de cada línea y el "Ver como tabla" no son adorno:
// tres colores de la paleta quedan por debajo de 3:1 contra el fondo, y ese
// WARN obliga a que el valor nunca dependa de distinguir el color.

import { useId, useMemo, useRef, useState } from "react";
import { niceTicks } from "@/lib/chart-scale";

export type LineSeries = {
  key: string;
  label: string;
  color: string;
  points: { date: string; value: number | null }[];
};

// Cuántas etiquetas de fecha caben abajo sin pisarse. Con dos años de meses,
// mostrar solo la primera y la última deja el eje mudo en el medio.
const MAX_DATE_TICKS = 5;

export function MultiLineChart({
  series,
  title,
  percent = false,
  width = 640,
  height = 300,
}: {
  series: LineSeries[];
  title: string;
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

  const padding = { top: 16, right: 124, bottom: 28, left: 52 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const stepX = allDates.length > 1 ? innerWidth / (allDates.length - 1) : 0;
  const xForDate = (date: string) => padding.left + allDates.indexOf(date) * stepX;

  const visibleSeries = series.filter((s) => !hidden.has(s.key));
  const allValues = visibleSeries.flatMap((s) => s.points.map((p) => p.value).filter((v): v is number => v != null));
  const dataMax = allValues.length > 0 ? Math.max(...allValues) : 0;
  const yTicks = niceTicks(0, dataMax > 0 ? dataMax : 1, 4);
  const yMax = yTicks[yTicks.length - 1];
  const yForValue = (v: number) => padding.top + innerHeight - (v / yMax) * innerHeight;

  const formatValue = (v: number) => (percent ? `${(v * 100).toFixed(1)}%` : Math.round(v).toLocaleString("es"));

  const dateTicks = useMemo(() => {
    if (allDates.length <= MAX_DATE_TICKS) return allDates.map((_, i) => i);
    const step = (allDates.length - 1) / (MAX_DATE_TICKS - 1);
    return Array.from({ length: MAX_DATE_TICKS }, (_, i) => Math.round(i * step));
  }, [allDates]);

  function toggle(key: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
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

  // Si dos líneas terminan muy cerca, sus etiquetas del extremo derecho se
  // separan en vertical para que ninguna quede ilegible debajo de la otra.
  const endLabels = useMemo(() => {
    const items = visibleSeries
      .map((s) => {
        const last = [...s.points].reverse().find((p) => p.value != null);
        if (!last || last.value == null) return null;
        return { key: s.key, label: s.label, color: s.color, y: yForValue(last.value) };
      })
      .filter((i): i is { key: string; label: string; color: string; y: number } => i != null)
      .sort((a, b) => a.y - b.y);

    for (let i = 1; i < items.length; i++) {
      const minGap = 13;
      if (items[i].y - items[i - 1].y < minGap) items[i].y = items[i - 1].y + minGap;
    }
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleSeries, yMax]);

  if (allDates.length === 0) return <p className="text-sm text-ink-muted">Sin datos todavía.</p>;

  return (
    <div className="w-full">
      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="w-full text-ink"
          role="img"
          aria-labelledby={titleId}
        >
          <title id={titleId}>{title}</title>

          {yTicks.map((t) => (
            <g key={t}>
              <line
                x1={padding.left}
                y1={yForValue(t)}
                x2={width - padding.right}
                y2={yForValue(t)}
                stroke="var(--line)"
              />
              <text x={padding.left - 8} y={yForValue(t)} dy={3} fontSize={11} fill="var(--axis-ink)" textAnchor="end">
                {formatValue(t)}
              </text>
            </g>
          ))}

          {visibleSeries.map((s) => {
            const coords = s.points
              .filter((p): p is { date: string; value: number } => p.value != null)
              .map((p) => ({ x: xForDate(p.date), y: yForValue(p.value) }));
            const path = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(" ");
            return (
              <g key={s.key}>
                <path d={path} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" />
                {/* Con muchos meses en el eje, un punto por mes emborrona la
                    línea: solo se marca el último valor de cada serie. */}
                {coords.length > 0 && (
                  <circle
                    cx={coords[coords.length - 1].x}
                    cy={coords[coords.length - 1].y}
                    r={4}
                    fill={s.color}
                    stroke="var(--surface)"
                    strokeWidth={2}
                  />
                )}
              </g>
            );
          })}

          {endLabels.map((item) => (
            <text
              key={item.key}
              x={width - padding.right + 8}
              y={item.y}
              dy={3}
              fontSize={11}
              fill="var(--ink-secondary)"
            >
              <tspan fill={item.color}>● </tspan>
              {item.label}
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

          {dateTicks.map((index) => (
            <text
              key={allDates[index]}
              x={padding.left + index * stepX}
              y={height - 6}
              fontSize={11}
              fill="var(--axis-ink)"
              textAnchor={index === 0 ? "start" : index === allDates.length - 1 ? "end" : "middle"}
            >
              {allDates[index]}
            </text>
          ))}
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
                <p key={s.key} className="tnum mt-0.5 flex items-baseline gap-1.5 text-ink-muted">
                  <span aria-hidden style={{ color: s.color }}>
                    ●
                  </span>
                  <span className="font-semibold text-ink">
                    {point?.value != null ? formatValue(point.value) : "—"}
                  </span>
                  <span>{s.label}</span>
                </p>
              );
            })}
          </div>
        )}
      </div>

      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
        {series.map((s) => (
          <li key={s.key}>
            <button
              type="button"
              onClick={() => toggle(s.key)}
              aria-pressed={!hidden.has(s.key)}
              className={`chip ${hidden.has(s.key) ? "opacity-40" : ""}`}
            >
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
              {s.label}
            </button>
          </li>
        ))}
      </ul>

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-ink-muted hover:text-ink">Ver como tabla</summary>
        <div className="mt-3 max-h-96 overflow-auto">
          <table className="w-full min-w-[480px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left text-ink-muted">
                <th className="px-2 py-2 font-medium">Mes</th>
                {series.map((s) => (
                  <th key={s.key} className="px-2 py-2 font-medium">
                    {s.label}
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
                      <td key={s.key} className="tnum px-2 py-2">
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
