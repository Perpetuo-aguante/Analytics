"use client";

// Piezas comunes de los charts hechos con Recharts: el tooltip flotante, el
// estilo de ejes y grilla, la leyenda conmutable y las etiquetas directas al
// final de cada línea. Todos los charts de la app las comparten para que se
// lean como un solo sistema (ver la skill dataviz: grilla recesiva, valor
// primero en el tooltip, leyenda siempre presente con 2+ series).

import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { EmptyState } from "../personaje";
import { usePlotArea, useYAxisScale, type TooltipContentProps } from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";

export type ChartTooltipProps = TooltipContentProps<ValueType, NameType>;

// ── Formatos ────────────────────────────────────────────────────────────

export function formatChartValue(value: number, percent = false): string {
  if (percent) return `${(value * 100).toFixed(1)}%`;
  return Math.round(value).toLocaleString("es");
}

// Ticks compactos para el eje Y: "12 mil" ocupa menos que "12.000" y el eje
// no se come el ancho del chart en un teléfono.
export function formatAxisValue(value: number, percent = false): string {
  if (percent) return `${Math.round(value * 100)}%`;
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toLocaleString("es", { maximumFractionDigits: 1 })} M`;
  if (abs >= 10_000) return `${Math.round(value / 1000).toLocaleString("es")} mil`;
  return Math.round(value).toLocaleString("es");
}

// ── Estilo de ejes y grilla ─────────────────────────────────────────────
// Recesivos: hairlines del color de línea, etiquetas en tinta de eje, sin
// línea de eje vertical ni marcas de tick.

export const AXIS_TICK = { fontSize: 11, fill: "var(--axis-ink)" } as const;

export const X_AXIS_PROPS = {
  tick: AXIS_TICK,
  tickLine: false,
  axisLine: { stroke: "var(--line-strong)" },
  tickMargin: 8,
} as const;

export const Y_AXIS_PROPS = {
  tick: AXIS_TICK,
  tickLine: false,
  axisLine: false,
  tickMargin: 6,
} as const;

export const GRID_PROPS = {
  stroke: "var(--line)",
  strokeDasharray: "3 4",
  vertical: false,
} as const;

// Crosshair: una línea vertical que sigue al cursor y encuentra la X.
export const CROSSHAIR = { stroke: "var(--line-strong)", strokeWidth: 1, strokeDasharray: "4 3" } as const;

// ── Tooltip ─────────────────────────────────────────────────────────────

export type TooltipRow = { key: string; label: string; color: string; value: string; shape?: "line" | "dot" };

// La tarjeta flotante. El valor va primero y en alto contraste; la serie
// después, en gris: quien mira el tooltip ya sabe qué serie es.
export function TooltipCard({ title, rows, footer }: { title?: ReactNode; rows: TooltipRow[]; footer?: ReactNode }) {
  return (
    <div className="chart-tooltip">
      {title != null && <p className="chart-tooltip__title">{title}</p>}
      <ul className="space-y-1">
        {rows.map((row) => (
          <li key={row.key} className="tnum flex items-baseline gap-2">
            <span
              className="chart-tooltip__key"
              style={{
                background: row.color,
                ...(row.shape === "dot" ? { width: 8, height: 8, borderRadius: 999, transform: "none" } : null),
              }}
              aria-hidden
            />
            <span className="font-semibold text-ink">{row.value}</span>
            <span className="truncate">{row.label}</span>
          </li>
        ))}
      </ul>
      {footer && <div className="mt-2 border-t border-line pt-1.5 text-[0.7rem] text-ink-muted">{footer}</div>}
    </div>
  );
}

// ── Leyenda conmutable ──────────────────────────────────────────────────

export function useSeriesToggle() {
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [focused, setFocused] = useState<string | null>(null);
  function toggle(key: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  return { hidden, toggle, focused, setFocused };
}

export type LegendItem = { key: string; label: string; color: string; swatch?: ReactNode };

// Cada chip oculta/muestra su serie al hacer clic; al pasar el cursor por
// encima la resalta en el chart (las demás se atenúan) sin ocultar nada.
export function LegendChips({
  items,
  hidden,
  onToggle,
  onFocus,
}: {
  items: LegendItem[];
  hidden: Set<string>;
  onToggle: (key: string) => void;
  onFocus?: (key: string | null) => void;
}) {
  return (
    <ul className="mt-4 flex flex-wrap gap-2 text-sm">
      {items.map((item) => {
        const isHidden = hidden.has(item.key);
        return (
          <li key={item.key}>
            <button
              type="button"
              onClick={() => onToggle(item.key)}
              onMouseEnter={() => onFocus?.(isHidden ? null : item.key)}
              onMouseLeave={() => onFocus?.(null)}
              onFocus={() => onFocus?.(isHidden ? null : item.key)}
              onBlur={() => onFocus?.(null)}
              aria-pressed={!isHidden}
              className={`chip ${isHidden ? "opacity-40 line-through decoration-ink-muted/60" : ""}`}
            >
              {item.swatch ?? (
                <span className="inline-block h-[3px] w-3.5 rounded-full" style={{ background: item.color }} aria-hidden />
              )}
              {item.label}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ── Etiquetas directas al final de las líneas ───────────────────────────
// Va como hijo del chart de Recharts: usa la escala Y real del chart para
// ubicar cada etiqueta a la altura del último valor de su serie, y separa
// en vertical las que caen muy juntas para que ninguna quede debajo de otra.

export type EndLabel = { key: string; label: string; color: string; value: number };

export function EndLabels({ items, dimmed }: { items: EndLabel[]; dimmed?: (key: string) => boolean }) {
  const yScale = useYAxisScale();
  const plot = usePlotArea();

  const placed = useMemo(() => {
    if (!yScale) return [];
    const out = items
      .map((item) => ({ ...item, y: Number(yScale(item.value)) }))
      .filter((item) => Number.isFinite(item.y))
      .sort((a, b) => a.y - b.y);
    const GAP = 14;
    for (let i = 1; i < out.length; i++) {
      if (out[i].y - out[i - 1].y < GAP) out[i].y = out[i - 1].y + GAP;
    }
    return out;
  }, [items, yScale]);

  if (!plot) return null;
  const x = plot.x + plot.width + 10;

  return (
    <g className="pointer-events-none">
      {placed.map((item) => (
        <g
          key={item.key}
          style={{ opacity: dimmed?.(item.key) ? 0.25 : 1, transition: "opacity 0.2s ease" }}
          transform={`translate(${x}, ${item.y})`}
        >
          <rect x={0} y={-1.5} width={10} height={3} rx={1.5} fill={item.color} />
          <text x={15} dy={4} fontSize={11} fill="var(--ink-secondary)" fontWeight={500}>
            {item.label}
          </text>
        </g>
      ))}
    </g>
  );
}

// ── Vista de tabla ──────────────────────────────────────────────────────
// Cada chart la tiene: el valor nunca depende de distinguir un color ni de
// acertarle con el cursor a un punto.

export function TableToggle({ children, label = "Ver como tabla" }: { children: ReactNode; label?: string }) {
  return (
    <details className="table-toggle mt-3 text-sm">
      <summary>{label}</summary>
      <div className="mt-3 max-h-96 overflow-auto rounded-xl border border-line bg-surface/60">{children}</div>
    </details>
  );
}

export function EmptyChart({ children = "Sin datos todavía." }: { children?: ReactNode }) {
  return <EmptyState compact>{children}</EmptyState>;
}

// ── Movimiento reducido ─────────────────────────────────────────────────
// Recharts anima las series al entrar; con prefers-reduced-motion se
// dibujan directo en su lugar.


const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReduced(callback: () => void) {
  const mq = window.matchMedia(REDUCED_QUERY);
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(REDUCED_QUERY).matches,
    () => false
  );
}

// ── Ancho del contenedor ────────────────────────────────────────────────
// En un teléfono las etiquetas al final de las líneas se comerían un tercio
// del plot: por debajo de este ancho se omiten y la leyenda (que sigue
// presente) carga la identidad de cada serie.

export const NARROW_CHART = 520;

export function useElementWidth<T extends HTMLElement>() {
  const [node, setNode] = useState<T | null>(null);
  const [width, setWidth] = useState<number | null>(null);
  useEffect(() => {
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);
  return { ref: setNode, width };
}
