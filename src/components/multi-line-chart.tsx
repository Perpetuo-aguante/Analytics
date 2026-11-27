"use client";

// Serie temporal de varias líneas (Recharts) con leyenda conmutable,
// crosshair con tooltip, zoom con brush y vista de tabla. Las series son
// dato: clave, etiqueta y color vienen de quien lo usa. SectionTimelineChart
// es este mismo chart con las series atadas a los tipos de post.
//
// La etiqueta al final de cada línea y el "Ver como tabla" no son adorno:
// tres colores de la paleta quedan por debajo de 3:1 contra el fondo, y ese
// WARN obliga a que el valor nunca dependa de distinguir el color.

import { useMemo, useState } from "react";
import {
  Brush,
  CartesianGrid,
  Line,
  LineChart as RLineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CROSSHAIR,
  EmptyChart,
  EndLabels,
  GRID_PROPS,
  LegendChips,
  NARROW_CHART,
  TableToggle,
  TooltipCard,
  X_AXIS_PROPS,
  Y_AXIS_PROPS,
  formatAxisValue,
  formatChartValue,
  useReducedMotion,
  useElementWidth,
  useSeriesToggle,
  type EndLabel,
  type LegendItem,
  type ChartTooltipProps,
} from "./charts/chart-kit";

export type LineSeries = {
  key: string;
  label: string;
  color: string;
  points: { date: string; value: number | null }[];
};

type Row = { date: string } & Record<string, number | null | string>;

// A partir de cuántas fechas aparece el brush para hacer zoom en un tramo.
const BRUSH_THRESHOLD = 12;

export function MultiLineChart({
  series,
  title,
  percent = false,
  keepEmptyDates = false,
  height = 300,
  legend,
}: {
  series: LineSeries[];
  title: string;
  percent?: boolean;
  // Mantiene en el eje las fechas en las que ninguna serie tiene valor, para
  // que la distancia en el eje sea proporcional al tiempo (meses sin datos
  // incluidos). Por defecto se omiten.
  keepEmptyDates?: boolean;
  height?: number;
  // Muestras de leyenda propias (ej. la forma del tipo de post).
  legend?: LegendItem[];
  // Compatibilidad con la versión SVG: el ancho ahora es el del contenedor.
  width?: number;
}) {
  const { hidden, toggle, focused, setFocused } = useSeriesToggle();
  const reduced = useReducedMotion();
  const { ref: containerRef, width: containerWidth } = useElementWidth<HTMLDivElement>();
  const narrow = containerWidth != null && containerWidth < NARROW_CHART;

  const allDates = useMemo(() => {
    const set = new Set<string>();
    for (const s of series) for (const p of s.points) if (keepEmptyDates || p.value != null) set.add(p.date);
    return Array.from(set).sort();
  }, [series, keepEmptyDates]);

  const rows = useMemo<Row[]>(() => {
    const byDate = new Map<string, Row>(allDates.map((date) => [date, { date } as Row]));
    for (const s of series) {
      for (const p of s.points) {
        const row = byDate.get(p.date);
        if (row) row[s.key] = p.value;
      }
    }
    return allDates.map((d) => byDate.get(d)!);
  }, [series, allDates]);

  const [range, setRange] = useState<{ start: number; end: number } | null>(null);
  const start = range?.start ?? 0;
  const end = range?.end ?? rows.length - 1;

  const visibleSeries = series.filter((s) => !hidden.has(s.key));

  // Las etiquetas del extremo derecho siguen al último valor DENTRO del
  // tramo visible: con el brush recortado, la etiqueta no puede quedar a la
  // altura de un punto que ya no está en pantalla.
  const endLabels = useMemo<EndLabel[]>(() => {
    const out: EndLabel[] = [];
    for (const s of visibleSeries) {
      for (let i = Math.min(end, rows.length - 1); i >= start; i--) {
        const v = rows[i]?.[s.key];
        if (typeof v === "number") {
          out.push({ key: s.key, label: s.label, color: s.color, value: v });
          break;
        }
      }
    }
    return out;
  }, [visibleSeries, rows, start, end]);

  if (allDates.length === 0) return <EmptyChart />;

  const showBrush = allDates.length > BRUSH_THRESHOLD;

  const renderTooltip = ({ active, payload, label }: ChartTooltipProps) => {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload as Row;
    return (
      <TooltipCard
        title={String(label)}
        rows={visibleSeries
          .map((s) => ({ s, v: row[s.key] }))
          .sort((a, b) => (typeof b.v === "number" ? b.v : -Infinity) - (typeof a.v === "number" ? a.v : -Infinity))
          .map(({ s, v }) => ({
            key: s.key,
            label: s.label,
            color: s.color,
            value: typeof v === "number" ? formatChartValue(v, percent) : "—",
          }))}
      />
    );
  };

  return (
    <div className="w-full" ref={containerRef}>
      <figure aria-label={title}>
        <RLineChart
          data={rows}
          responsive
          style={{ width: "100%", height: height + (showBrush ? 36 : 0) }}
          margin={{ top: 12, right: narrow ? 8 : 112, bottom: 4, left: 0 }}
          accessibilityLayer
        >
          <title>{title}</title>
          <CartesianGrid {...GRID_PROPS} />
          <XAxis dataKey="date" {...X_AXIS_PROPS} minTickGap={28} />
          <YAxis {...Y_AXIS_PROPS} width={52} tickFormatter={(v: number) => formatAxisValue(v, percent)} />
          <Tooltip content={renderTooltip} cursor={CROSSHAIR} isAnimationActive={false} />
          {visibleSeries.map((s) => {
            const dim = focused != null && focused !== s.key;
            return (
              <Line
                key={s.key}
                dataKey={s.key}
                name={s.label}
                type="monotone"
                stroke={s.color}
                strokeWidth={focused === s.key ? 3 : 2}
                strokeOpacity={dim ? 0.15 : 1}
                strokeLinecap="round"
                // Sin keepEmptyDates, una fecha sin valor para ESTA serie no la
                // corta (otra serie sí tenía dato ahí). Con keepEmptyDates, el
                // hueco es real y unir los lados inventaría valores.
                connectNulls={!keepEmptyDates}
                dot={keepEmptyDates ? { r: 2.5, fill: s.color, strokeWidth: 0, fillOpacity: dim ? 0.15 : 1 } : false}
                activeDot={{ r: 5, fill: s.color, stroke: "var(--surface)", strokeWidth: 2 }}
                isAnimationActive={!reduced}
                animationDuration={900}
                animationEasing="ease-out"
              />
            );
          })}
          {!narrow && <EndLabels items={endLabels} dimmed={(key) => focused != null && focused !== key} />}
          {showBrush && (
            <Brush
              dataKey="date"
              height={24}
              travellerWidth={8}
              stroke="var(--blue)"
              fill="var(--surface)"
              tickFormatter={() => ""}
              onChange={(r) => {
                if (r.startIndex != null && r.endIndex != null) setRange({ start: r.startIndex, end: r.endIndex });
              }}
            />
          )}
        </RLineChart>
        {showBrush && (
          <figcaption className="mt-1 text-xs text-ink-muted">
            Arrastra los extremos de la barra de abajo para hacer zoom en un tramo.
          </figcaption>
        )}
      </figure>

      <LegendChips
        items={legend ?? series.map((s) => ({ key: s.key, label: s.label, color: s.color }))}
        hidden={hidden}
        onToggle={toggle}
        onFocus={setFocused}
      />

      <TableToggle>
        <table className="w-full min-w-[480px] border-collapse text-sm">
          <thead className="sticky top-0 bg-surface">
            <tr className="border-b border-line text-left text-ink-muted">
              <th className="px-3 py-2 font-medium">Fecha</th>
              {series.map((s) => (
                <th key={s.key} className="px-3 py-2 font-medium">
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.date} className="border-b border-line/60">
                <td className="px-3 py-2">{row.date}</td>
                {series.map((s) => {
                  const v = row[s.key];
                  return (
                    <td key={s.key} className="tnum px-3 py-2">
                      {typeof v === "number" ? formatChartValue(v, percent) : "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </TableToggle>
    </div>
  );
}
