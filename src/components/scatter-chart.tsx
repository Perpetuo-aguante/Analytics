"use client";

import { useId, useState } from "react";
import { niceTicks } from "@/lib/chart-scale";
import { formatNumber, formatPercent } from "@/lib/display";
import type { Category } from "@/lib/categories";
import { MarkerShapeIcon } from "./marker-shape";

export type ScatterDatum = {
  id: string;
  slug: string;
  title: string;
  category: Category;
  x: number;
  y: number;
};

// Los formatos se pasan por nombre (no como funciones) porque este es un
// componente cliente: una página server no puede pasarle funciones como
// props — React no las puede serializar y la página entera tira 500.
export type AxisFormat = "number" | "percent";

const FORMATTERS: Record<AxisFormat, (value: number) => string> = {
  number: formatNumber,
  percent: formatPercent,
};

// Tope de eje a partir de los valores. Solo cae a 1 cuando no hay nada que
// escalar (sin datos, o todos en cero), para no dividir por cero al mapear.
function axisMax(values: number[]): number {
  const max = values.length > 0 ? Math.max(...values) : 0;
  return max > 0 ? max : 1;
}

export function ScatterChart({
  data,
  categories,
  xLabel,
  yLabel,
  xFormat = "number",
  yFormat = "number",
  width = 640,
  height = 440,
}: {
  data: ScatterDatum[];
  // La lista completa (no solo la presente en `data`) para que el orden del
  // legend sea siempre el mismo — el de sort_order — en vez de depender de
  // en qué orden vienen las filas.
  categories: Category[];
  xLabel: string;
  yLabel: string;
  xFormat?: AxisFormat;
  yFormat?: AxisFormat;
  width?: number;
  height?: number;
}) {
  const formatX = FORMATTERS[xFormat];
  const formatY = FORMATTERS[yFormat];
  const titleId = useId();
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [active, setActive] = useState<ScatterDatum | null>(null);

  const typesPresent = categories.filter((c) => data.some((d) => d.category.id === c.id));

  function toggle(categoryId: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  }

  const padding = { top: 16, right: 20, bottom: 44, left: 64 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  // El tope de cada eje sale de los datos, nunca de un mínimo fijo: con una
  // métrica en fracción (open rate, engagement) un piso de 1 forzaba el eje
  // hasta 100% y aplastaba todos los puntos contra la línea base.
  const xTicks = niceTicks(0, axisMax(data.map((d) => d.x)), 5);
  const yTicks = niceTicks(0, axisMax(data.map((d) => d.y)), 5);
  const xMax = xTicks[xTicks.length - 1];
  const yMax = yTicks[yTicks.length - 1];

  const scaleX = (v: number) => padding.left + (v / xMax) * innerWidth;
  const scaleY = (v: number) => padding.top + innerHeight - (v / yMax) * innerHeight;

  const visible = data.filter((d) => !hidden.has(d.category.id));

  return (
    <div className="w-full">
      <div className="relative">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full text-ink" role="img" aria-labelledby={titleId}>
          <title id={titleId}>{`${yLabel} vs. ${xLabel}`}</title>

          {yTicks.map((t) => (
            <g key={`y-${t}`}>
              <line
                x1={padding.left}
                y1={scaleY(t)}
                x2={width - padding.right}
                y2={scaleY(t)}
                stroke="var(--line)"
              />
              <text x={padding.left - 8} y={scaleY(t)} dy={3} fontSize={11} fill="var(--axis-ink)" textAnchor="end">
                {formatY(t)}
              </text>
            </g>
          ))}
          {xTicks.map((t) => (
            <text
              key={`x-${t}`}
              x={scaleX(t)}
              y={height - padding.bottom + 18}
              fontSize={11}
              fill="var(--axis-ink)"
              textAnchor="middle"
            >
              {formatX(t)}
            </text>
          ))}

          <line
            x1={padding.left}
            y1={height - padding.bottom}
            x2={width - padding.right}
            y2={height - padding.bottom}
            stroke="var(--line-strong)"
          />
          <line x1={padding.left} y1={padding.top} x2={padding.left} y2={height - padding.bottom} stroke="var(--line-strong)" />

          <text x={(width - padding.right + padding.left) / 2} y={height - 6} fontSize={11} fill="var(--axis-ink)" textAnchor="middle">
            {xLabel}
          </text>
          <text
            x={-((height - padding.bottom + padding.top) / 2)}
            y={14}
            fontSize={11}
            fill="var(--axis-ink)"
            textAnchor="middle"
            transform="rotate(-90)"
          >
            {yLabel}
          </text>

          {visible.map((d) => {
            const style = d.category;
            const cx = scaleX(d.x);
            const cy = scaleY(d.y);
            return (
              // El punto lleva al post. El área sensible (r=14) es mucho mayor
              // que el marcador (9px): un punto de 9px es imposible de acertar
              // con el mouse, y aún más con el dedo.
              <a
                key={d.id}
                href={`/post/${d.slug}`}
                aria-label={`${d.title}: ${xLabel} ${formatX(d.x)}, ${yLabel} ${formatY(d.y)} (${d.category.name})`}
                onMouseEnter={() => setActive(d)}
                onMouseLeave={() => setActive((cur) => (cur?.id === d.id ? null : cur))}
                onFocus={() => setActive(d)}
                onBlur={() => setActive((cur) => (cur?.id === d.id ? null : cur))}
                className="cursor-pointer outline-none focus-visible:opacity-80"
              >
                <circle cx={cx} cy={cy} r={14} fill="transparent" />
                {/* Anillo del color de la superficie para que los puntos
                    encimados se sigan distinguiendo uno de otro. */}
                <circle cx={cx} cy={cy} r={6} fill="var(--surface)" opacity={0.95} />
                <MarkerShapeIcon shape={style.shape} cx={cx} cy={cy} size={9} color={style.color} />
              </a>
            );
          })}
        </svg>

        {active && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-lg"
            style={{
              left: `${(scaleX(active.x) / width) * 100}%`,
              top: `${(scaleY(active.y) / height) * 100}%`,
              marginTop: -10,
            }}
          >
            <p className="max-w-[220px] font-medium">{active.title}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-ink-muted">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: active.category.color }}
                aria-hidden
              />
              {active.category.name}
            </p>
            <p className="tnum mt-1.5 text-ink-muted">
              {xLabel} <span className="font-semibold text-ink">{formatX(active.x)}</span>
            </p>
            <p className="tnum text-ink-muted">
              {yLabel} <span className="font-semibold text-ink">{formatY(active.y)}</span>
            </p>
          </div>
        )}
      </div>

      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
        {typesPresent.map((category) => {
          const isHidden = hidden.has(category.id);
          return (
            <li key={category.id}>
              <button
                type="button"
                onClick={() => toggle(category.id)}
                aria-pressed={!isHidden}
                className={`chip ${isHidden ? "opacity-40" : ""}`}
              >
                <svg width={12} height={12} viewBox="0 0 12 12" aria-hidden>
                  <MarkerShapeIcon shape={category.shape} cx={6} cy={6} size={9} color={category.color} />
                </svg>
                {category.name}
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
                <th className="px-2 py-2 font-medium">Post</th>
                <th className="px-2 py-2 font-medium">Tipo</th>
                <th className="px-2 py-2 font-medium">{xLabel}</th>
                <th className="px-2 py-2 font-medium">{yLabel}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.id} className="border-b border-line/60">
                  <td className="px-2 py-2">{d.title}</td>
                  <td className="px-2 py-2">{d.category.name}</td>
                  <td className="px-2 py-2">{formatX(d.x)}</td>
                  <td className="px-2 py-2">{formatY(d.y)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
