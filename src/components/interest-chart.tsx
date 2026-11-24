"use client";

// Vistas nuevas por día entre cargas (ver lib/interest.ts). Cada barra es un
// tramo entre dos cargas: arranca en la carga anterior (o en la publicación)
// y termina en la siguiente, así que su ancho es proporcional a los días que
// cubre y su altura a las vistas por día. El pico se marca con etiqueta
// directa y los tramos de "segunda vida" con un rombo arriba de la barra.

import { useId, useState } from "react";
import { niceTicks } from "@/lib/chart-scale";
import type { InterestInterval } from "@/lib/interest";

const DAY_MS = 86_400_000;
const toTime = (date: string) => Date.parse(`${date}T00:00:00Z`);
const formatDate = (date: string) =>
  new Intl.DateTimeFormat("es", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(toTime(date)));
const formatRate = (v: number) => (v >= 10 ? Math.round(v).toLocaleString("es") : v.toFixed(1));

export function InterestChart({
  intervals,
  peak,
  resurgences,
  width = 640,
  height = 220,
}: {
  intervals: InterestInterval[];
  peak: InterestInterval | null;
  resurgences: InterestInterval[];
  width?: number;
  height?: number;
}) {
  const titleId = useId();
  const [hover, setHover] = useState<number | null>(null);
  if (intervals.length === 0) return null;

  const padding = { top: 28, right: 12, bottom: 24, left: 40 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const t0 = toTime(intervals[0].start);
  const t1 = toTime(intervals[intervals.length - 1].end);
  const span = Math.max(t1 - t0, DAY_MS);
  const xFor = (date: string) => padding.left + ((toTime(date) - t0) / span) * innerWidth;
  const yTicks = niceTicks(0, Math.max(...intervals.map((i) => i.perDay), 1), 4);
  const yMax = yTicks[yTicks.length - 1];
  const yFor = (v: number) => padding.top + innerHeight - (v / yMax) * innerHeight;
  const baseline = padding.top + innerHeight;
  const GAP = 2; // separación de superficie entre barras vecinas

  const bars = intervals.map((interval, index) => {
    const x0 = xFor(interval.start) + GAP / 2;
    const x1 = xFor(interval.end) - GAP / 2;
    return { interval, index, x: x0, w: Math.max(x1 - x0, 2), y: yFor(interval.perDay) };
  });
  const hovered = hover != null ? bars[hover] : null;
  const peakBar = peak ? bars.find((b) => b.interval === peak) : undefined;

  return (
    <figure>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-labelledby={titleId}
        onMouseLeave={() => setHover(null)}
      >
        <title id={titleId}>Vistas nuevas por día entre cargas</title>
        {yTicks.map((tick) => (
          <g key={tick}>
            <line x1={padding.left} x2={width - padding.right} y1={yFor(tick)} y2={yFor(tick)} stroke="var(--line)" strokeWidth={1} />
            <text x={padding.left - 6} y={yFor(tick)} dy="0.32em" textAnchor="end" className="fill-[var(--ink-muted)] text-[10px]">
              {formatRate(tick)}
            </text>
          </g>
        ))}
        {bars.map(({ interval, index, x, w, y }) => {
          const h = Math.max(baseline - y, interval.perDay > 0 ? 1 : 0);
          const r = Math.min(4, w / 2, h);
          // Extremo de datos redondeado (arriba), anclado recto a la base.
          const d = `M${x},${baseline} V${baseline - h + r} Q${x},${baseline - h} ${x + r},${baseline - h} H${x + w - r} Q${x + w},${baseline - h} ${x + w},${baseline - h + r} V${baseline} Z`;
          const isPeak = interval === peak;
          return (
            <path
              key={index}
              d={d}
              fill={isPeak ? "var(--blue-deep)" : "var(--blue)"}
              opacity={hover == null || hover === index ? 1 : 0.55}
            />
          );
        })}
        {resurgences.map((interval) => {
          const bar = bars.find((b) => b.interval === interval);
          if (!bar) return null;
          const cx = bar.x + bar.w / 2;
          const cy = bar.y - 8;
          return (
            <path
              key={interval.end}
              d={`M${cx},${cy - 5} L${cx + 5},${cy} L${cx},${cy + 5} L${cx - 5},${cy} Z`}
              fill="var(--red)"
              stroke="var(--surface)"
              strokeWidth={2}
            />
          );
        })}
        {peakBar && (
          <text
            x={Math.min(Math.max(peakBar.x + peakBar.w / 2, padding.left + 40), width - padding.right - 40)}
            y={peakBar.y - (resurgences.includes(peakBar.interval) ? 18 : 6)}
            textAnchor="middle"
            className="fill-[var(--ink)] text-[11px] font-medium"
          >
            Pico: {formatRate(peakBar.interval.perDay)}/día
          </text>
        )}
        <text x={padding.left} y={height - 6} className="fill-[var(--ink-muted)] text-[10px]">
          {formatDate(intervals[0].start)}
        </text>
        <text x={width - padding.right} y={height - 6} textAnchor="end" className="fill-[var(--ink-muted)] text-[10px]">
          {formatDate(intervals[intervals.length - 1].end)}
        </text>
        {/* Áreas de hover más anchas que la barra: cubren toda la altura del tramo. */}
        {bars.map(({ index, x, w }) => (
          <rect
            key={`hit-${index}`}
            x={x - GAP / 2}
            y={padding.top}
            width={w + GAP}
            height={innerHeight}
            fill="transparent"
            onMouseEnter={() => setHover(index)}
          />
        ))}
      </svg>
      <div className="min-h-[2.5rem] text-xs text-ink-secondary" aria-live="polite">
        {hovered ? (
          <p>
            <span className="font-medium text-ink">
              {formatDate(hovered.interval.start)} → {formatDate(hovered.interval.end)}
            </span>{" "}
            · {hovered.interval.newViews.toLocaleString("es")} vistas nuevas en {hovered.interval.days}{" "}
            {hovered.interval.days === 1 ? "día" : "días"} · {formatRate(hovered.interval.perDay)}/día
            {hovered.interval.launch && " · lanzamiento"}
            {resurgences.includes(hovered.interval) && " · segunda vida"}
          </p>
        ) : (
          <p className="text-ink-muted">
            Pasa el cursor por una barra para ver el tramo.
            {resurgences.length > 0 && " El rombo marca un repunte de interés pasado el lanzamiento."}
          </p>
        )}
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-ink-secondary hover:text-ink">Ver como tabla</summary>
        <table className="mt-2 w-full border-collapse text-xs tnum">
          <thead>
            <tr className="border-b border-line text-left text-ink-muted">
              <th className="py-1 pr-2 font-medium">Tramo</th>
              <th className="px-2 py-1 text-right font-medium">Vistas nuevas</th>
              <th className="px-2 py-1 text-right font-medium">Por día</th>
            </tr>
          </thead>
          <tbody>
            {intervals.map((i) => (
              <tr key={i.end} className="border-b border-line/60">
                <td className="py-1 pr-2">
                  {formatDate(i.start)} → {formatDate(i.end)}
                  {i === peak && " · pico"}
                  {resurgences.includes(i) && " · segunda vida"}
                </td>
                <td className="px-2 py-1 text-right">{i.newViews.toLocaleString("es")}</td>
                <td className="px-2 py-1 text-right">{formatRate(i.perDay)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
