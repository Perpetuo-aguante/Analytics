"use client";

import { useId } from "react";

export type ChartPoint = { date: string; value: number | null };

export function LineChart({
  points,
  percent = false,
  width = 640,
  height = 200,
}: {
  points: ChartPoint[];
  percent?: boolean;
  width?: number;
  height?: number;
}) {
  const gradientId = useId();
  const padding = { top: 20, right: 16, bottom: 24, left: 8 };
  const valid = points.filter((p): p is { date: string; value: number } => p.value != null);
  if (valid.length === 0) return null;

  const values = valid.map((p) => p.value);
  const minValue = Math.min(...values, 0);
  const maxValue = Math.max(...values);
  const range = maxValue - minValue || 1;

  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const stepX = points.length > 1 ? innerWidth / (points.length - 1) : 0;
  const baseline = height - padding.bottom;

  const coords = points.map((p, i) => ({
    x: padding.left + i * stepX,
    y: p.value == null ? null : padding.top + innerHeight - ((p.value - minValue) / range) * innerHeight,
  }));

  const linePoints = coords.filter((c): c is { x: number; y: number } => c.y != null);
  const path = linePoints.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(" ");

  // El área rellena hasta la línea base (arranca y termina ahí, no en el
  // primer/último punto) para que se lea como "volumen bajo la curva" — una
  // sola línea sola no deja ver de un vistazo si una serie sube o baja tan
  // rápido como el relleno.
  const areaPath =
    linePoints.length > 0
      ? `M ${linePoints[0].x.toFixed(1)} ${baseline.toFixed(1)} ` +
        linePoints.map((c) => `L ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(" ") +
        ` L ${linePoints[linePoints.length - 1].x.toFixed(1)} ${baseline.toFixed(1)} Z`
      : "";

  const formatValue = (v: number) => (percent ? `${(v * 100).toFixed(1)}%` : Math.round(v).toLocaleString("es"));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--blue)" stopOpacity={0.28} />
          <stop offset="100%" stopColor="var(--blue)" stopOpacity={0} />
        </linearGradient>
      </defs>

      <line
        x1={padding.left}
        y1={baseline}
        x2={width - padding.right}
        y2={baseline}
        stroke="var(--line)"
      />

      {areaPath && <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />}
      <path d={path} fill="none" stroke="var(--blue)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {linePoints.map((c, i) => (
        <circle key={i} cx={c.x} cy={c.y} r={4} fill="var(--blue)" stroke="var(--surface)" strokeWidth={2} />
      ))}

      <text x={padding.left} y={padding.top - 6} fontSize={11} fill="var(--axis-ink)">
        {formatValue(maxValue)}
      </text>
      <text x={padding.left} y={baseline - 6} fontSize={11} fill="var(--axis-ink)">
        {formatValue(minValue)}
      </text>

      <text x={padding.left} y={height - 4} fontSize={11} fill="var(--axis-ink)">
        {valid[0].date}
      </text>
      <text x={width - padding.right} y={height - 4} fontSize={11} fill="var(--axis-ink)" textAnchor="end">
        {valid[valid.length - 1].date}
      </text>
    </svg>
  );
}
