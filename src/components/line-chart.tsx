"use client";

// Una sola serie en el tiempo: área con degradado de marca, crosshair con
// tooltip y el punto activo que sigue al cursor. Una serie no lleva leyenda:
// el título de la tarjeta que la contiene ya la nombra.

import { useId, useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney } from "@/lib/display";
import {
  CROSSHAIR,
  GRID_PROPS,
  TooltipCard,
  X_AXIS_PROPS,
  Y_AXIS_PROPS,
  formatAxisValue,
  formatChartValue,
  useReducedMotion,
  type ChartTooltipProps,
} from "./charts/chart-kit";

export type ChartPoint = { date: string; value: number | null };

export function LineChart({
  points,
  percent = false,
  money = false,
  height = 200,
  color = "var(--blue)",
  label = "Valor",
}: {
  points: ChartPoint[];
  percent?: boolean;
  money?: boolean;
  height?: number;
  color?: string;
  label?: string;
  // Compatibilidad con la versión SVG: el ancho ahora es el del contenedor.
  width?: number;
}) {
  const gradientId = `area-${useId().replace(/:/g, "")}`;
  const reduced = useReducedMotion();

  const format = (v: number) => (money ? formatMoney(v) : formatChartValue(v, percent));
  const formatTick = (v: number) => (money ? formatMoney(v) : formatAxisValue(v, percent));

  // El máximo de la serie se marca con un punto anclado: es lo primero que
  // se busca en una curva de crecimiento.
  const peak = useMemo(() => {
    let best: { date: string; value: number; index: number } | null = null;
    points.forEach((p, index) => {
      if (p.value != null && (best == null || p.value > best.value)) best = { date: p.date, value: p.value, index };
    });
    return best as { date: string; value: number; index: number } | null;
  }, [points]);
  // Cerca de los bordes la etiqueta se alinea hacia adentro para no cortarse.
  const peakAnchor =
    peak == null ? "middle" : peak.index > points.length * 0.8 ? "end" : peak.index < points.length * 0.2 ? "start" : "middle";

  if (!points.some((p) => p.value != null)) return null;

  const renderTooltip = ({ active, payload, label: date }: ChartTooltipProps) => {
    if (!active || !payload?.length) return null;
    const v = payload[0].value;
    return (
      <TooltipCard
        title={String(date)}
        rows={[{ key: "v", label, color, value: typeof v === "number" ? format(v) : "—" }]}
      />
    );
  };

  return (
    <AreaChart
      data={points}
      responsive
      style={{ width: "100%", height }}
      margin={{ top: 24, right: 12, bottom: 0, left: 0 }}
      accessibilityLayer
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.32} />
          <stop offset="70%" stopColor={color} stopOpacity={0.06} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <CartesianGrid {...GRID_PROPS} />
      <XAxis dataKey="date" {...X_AXIS_PROPS} minTickGap={32} />
      <YAxis {...Y_AXIS_PROPS} width={money ? 64 : 48} tickFormatter={formatTick} domain={[(min: number) => Math.min(0, min), "auto"]} />
      <Tooltip content={renderTooltip} cursor={CROSSHAIR} isAnimationActive={false} />
      <Area
        dataKey="value"
        name={label}
        type="monotone"
        stroke={color}
        strokeWidth={2}
        fill={`url(#${gradientId})`}
        connectNulls
        dot={points.length <= 16 ? { r: 3, fill: color, stroke: "var(--surface)", strokeWidth: 2 } : false}
        activeDot={{ r: 5.5, fill: color, stroke: "var(--surface)", strokeWidth: 2.5 }}
        isAnimationActive={!reduced}
        animationDuration={900}
        animationEasing="ease-out"
      />
      {peak && points.length > 2 && (
        <ReferenceDot
          x={peak.date}
          y={peak.value}
          r={0}
          label={{
            value: `Máx. ${format(peak.value)}`,
            position: "top",
            offset: 10,
            textAnchor: peakAnchor,
            fontSize: 11,
            fill: "var(--ink-secondary)",
            fontWeight: 500,
          }}
        />
      )}
    </AreaChart>
  );
}
