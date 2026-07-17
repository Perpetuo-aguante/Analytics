"use client";

import { useId, useMemo, useRef, useState } from "react";
import { niceTicks } from "@/lib/chart-scale";
import { postTypeStyle } from "@/lib/post-type-style";
import type { LeaderboardPostType } from "@/lib/post-types";

export type TimelineSeries = {
  postType: LeaderboardPostType;
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
  const [hidden, setHidden] = useState<Set<LeaderboardPostType>>(() => new Set());
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

  const visibleSeries = series.filter((s) => !hidden.has(s.postType));
  const allValues = visibleSeries.flatMap((s) => s.points.map((p) => p.value).filter((v): v is number => v != null));
  const yTicks = niceTicks(0, Math.max(1, ...allValues, 0), 4);
  const yMax = yTicks[yTicks.length - 1];
  const yForValue = (v: number) => padding.top + innerHeight - (v / yMax) * innerHeight;

  const formatValue = (v: number) => (percent ? `${(v * 100).toFixed(1)}%` : Math.round(v).toLocaleString("es"));

  function toggle(type: LeaderboardPostType) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
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
        return { postType: s.postType, value: last.value, y: yForValue(last.value) };
      })
      .filter((i): i is { postType: LeaderboardPostType; value: number; y: number } => i != null)
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
        <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} className="w-full text-foreground" role="img" aria-labelledby={titleId}>
          <title id={titleId}>Serie histórica por sección</title>

          {yTicks.map((t) => (
            <g key={t}>
              <line x1={padding.left} y1={yForValue(t)} x2={width - padding.right} y2={yForValue(t)} stroke="currentColor" strokeOpacity={0.1} />
              <text x={padding.left - 8} y={yForValue(t)} dy={3} fontSize={11} fill="currentColor" opacity={0.6} textAnchor="end">
                {formatValue(t)}
              </text>
            </g>
          ))}

          {visibleSeries.map((s) => {
            const style = postTypeStyle(s.postType);
            const coords = s.points
              .filter((p): p is { date: string; value: number } => p.value != null)
              .map((p) => ({ x: xForDate(p.date), y: yForValue(p.value) }));
            const path = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(" ");
            return (
              <g key={s.postType}>
                <path d={path} fill="none" stroke={style.color} strokeWidth={2} />
                {coords.map((c, i) => (
                  <circle key={i} cx={c.x} cy={c.y} r={3} fill={style.color} stroke="var(--background)" strokeWidth={1.5} />
                ))}
              </g>
            );
          })}

          {endLabels.map((item) => {
            const style = postTypeStyle(item.postType);
            return (
              <text key={item.postType} x={width - padding.right + 8} y={item.y} dy={3} fontSize={11} fill="currentColor">
                <tspan fill={style.color}>● </tspan>
                {item.postType}
              </text>
            );
          })}

          {hoverIndex != null && allDates[hoverIndex] && (
            <line
              x1={padding.left + hoverIndex * stepX}
              y1={padding.top}
              x2={padding.left + hoverIndex * stepX}
              y2={height - padding.bottom}
              stroke="currentColor"
              strokeOpacity={0.2}
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
              <text x={padding.left} y={height - 6} fontSize={11} fill="currentColor" opacity={0.6}>
                {allDates[0]}
              </text>
              <text x={width - padding.right} y={height - 6} fontSize={11} fill="currentColor" opacity={0.6} textAnchor="end">
                {allDates[allDates.length - 1]}
              </text>
            </>
          )}
        </svg>

        {hoverIndex != null && allDates[hoverIndex] && (
          <div
            className="pointer-events-none absolute top-2 z-10 -translate-x-1/2 rounded-lg border border-border bg-background px-3 py-2 text-xs shadow-md"
            style={{ left: `${(xForDate(allDates[hoverIndex]) / width) * 100}%` }}
          >
            <p className="font-medium">{allDates[hoverIndex]}</p>
            {visibleSeries.map((s) => {
              const point = s.points.find((p) => p.date === allDates[hoverIndex]);
              const style = postTypeStyle(s.postType);
              return (
                <p key={s.postType} className="mt-0.5 text-muted">
                  <span style={{ color: style.color }}>●</span> {s.postType}:{" "}
                  <span className="font-medium text-foreground">{point?.value != null ? formatValue(point.value) : "—"}</span>
                </p>
              );
            })}
          </div>
        )}
      </div>

      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
        {series.map((s) => {
          const style = postTypeStyle(s.postType);
          const isHidden = hidden.has(s.postType);
          return (
            <li key={s.postType}>
              <button
                type="button"
                onClick={() => toggle(s.postType)}
                aria-pressed={!isHidden}
                className={`flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 transition-opacity ${
                  isHidden ? "opacity-40" : ""
                }`}
              >
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: style.color }} />
                {s.postType}
              </button>
            </li>
          );
        })}
      </ul>

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-muted hover:text-foreground">Ver como tabla</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[480px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th className="px-2 py-2 font-medium">Fecha</th>
                {series.map((s) => (
                  <th key={s.postType} className="px-2 py-2 font-medium">
                    {s.postType}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allDates.map((date) => (
                <tr key={date} className="border-b border-border/60">
                  <td className="px-2 py-2">{date}</td>
                  {series.map((s) => {
                    const point = s.points.find((p) => p.date === date);
                    return (
                      <td key={s.postType} className="px-2 py-2">
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
