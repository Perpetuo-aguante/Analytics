"use client";

import { useId, useState } from "react";
import { niceTicks } from "@/lib/chart-scale";
import type { Category } from "@/lib/categories";
import { MarkerShapeIcon } from "./marker-shape";

// Mapa de textos: cada punto es un texto en dos ejes (el compass editorial,
// de 0 a 1, o cualquier par de valores). Es el mismo lenguaje visual que
// ScatterChart (forma y color por sección, leyenda que oculta secciones,
// "Ver como tabla"), pero con ejes que pueden ser negativos, puntos
// atenuados (baja confianza) y un punto destacado (el post que se mira o el
// borrador que se compara).

export type TextMapDatum = {
  id: string;
  slug: string;
  title: string;
  category: Category;
  x: number;
  y: number;
  // Se dibuja atenuado (ej. baja confianza o evidencia inválida).
  faded?: boolean;
  // Una línea más en el tooltip.
  note?: string;
};

// "unit" = 0 a 1, "signed" = -1 a 1, "free" = lo que digan los datos.
export type AxisDomain = "unit" | "signed" | "free";

export type AxisSpec = {
  label: string;
  domain: AxisDomain;
  // Qué hay en cada extremo, para ejes que no se leen solos (el mapa
  // léxico): "← patria, gobierno" / "madre, casa →".
  lowHint?: string;
  highHint?: string;
};

function domainFor(spec: AxisSpec, values: number[]): [number, number] {
  if (spec.domain === "unit") return [0, 1];
  if (spec.domain === "signed") return [-1, 1];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min) * 0.08 || 0.1;
  return [min - pad, max + pad];
}

function formatTick(spec: AxisSpec, value: number): string {
  if (spec.domain === "free") return "";
  if (spec.domain === "signed") return value > 0 ? `+${value.toFixed(1)}` : value.toFixed(1);
  return `${Math.round(value * 100)}`;
}

function formatValue(spec: AxisSpec, value: number): string {
  if (spec.domain === "signed") return value > 0 ? `+${value.toFixed(2)}` : value.toFixed(2);
  if (spec.domain === "unit") return `${Math.round(value * 100)}/100`;
  return value.toFixed(2);
}

export function TextMap({
  data,
  categories,
  x,
  y,
  highlight,
  midlines = false,
  width = 640,
  height = 480,
}: {
  data: TextMapDatum[];
  categories: Category[];
  x: AxisSpec;
  y: AxisSpec;
  highlight?: { x: number; y: number; label: string } | null;
  // Líneas en el centro de cada eje: parten el plano en cuadrantes.
  midlines?: boolean;
  width?: number;
  height?: number;
}) {
  const titleId = useId();
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [active, setActive] = useState<TextMapDatum | null>(null);
  const typesPresent = categories.filter((c) => data.some((d) => d.category.id === c.id));

  function toggle(categoryId: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  }

  const padding = { top: 16, right: 20, bottom: 52, left: 64 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const xs = [...data.map((d) => d.x), ...(highlight ? [highlight.x] : [])];
  const ys = [...data.map((d) => d.y), ...(highlight ? [highlight.y] : [])];
  const [xMin, xMax] = domainFor(x, xs.length > 0 ? xs : [0, 1]);
  const [yMin, yMax] = domainFor(y, ys.length > 0 ? ys : [0, 1]);
  const xTicks = x.domain === "free" ? [] : niceTicks(xMin, xMax, 5);
  const yTicks = y.domain === "free" ? [] : niceTicks(yMin, yMax, 5);

  const scaleX = (v: number) => padding.left + ((v - xMin) / (xMax - xMin)) * innerWidth;
  const scaleY = (v: number) => padding.top + innerHeight - ((v - yMin) / (yMax - yMin)) * innerHeight;

  const visible = data.filter((d) => !hidden.has(d.category.id));
  const tooltip = active ?? null;

  return (
    <div className="w-full">
      <div className="relative">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full text-ink" role="img" aria-labelledby={titleId}>
          <title id={titleId}>{`${y.label} vs. ${x.label}`}</title>

          {/* Cuadrícula recesiva. En el mapa léxico no hay números que leer:
              solo una cruz en el centro para orientar. */}
          {yTicks.map((t) => (
            <g key={`y-${t}`}>
              <line x1={padding.left} y1={scaleY(t)} x2={width - padding.right} y2={scaleY(t)} stroke="var(--line)" />
              <text x={padding.left - 8} y={scaleY(t)} dy={3} fontSize={11} fill="var(--axis-ink)" textAnchor="end">
                {formatTick(y, t)}
              </text>
            </g>
          ))}
          {xTicks.map((t) => (
            <g key={`x-${t}`}>
              <line x1={scaleX(t)} y1={padding.top} x2={scaleX(t)} y2={height - padding.bottom} stroke="var(--line)" />
              <text x={scaleX(t)} y={height - padding.bottom + 16} fontSize={11} fill="var(--axis-ink)" textAnchor="middle">
                {formatTick(x, t)}
              </text>
            </g>
          ))}
          {x.domain !== "unit" && xMin < 0 && xMax > 0 && (
            <line x1={scaleX(0)} y1={padding.top} x2={scaleX(0)} y2={height - padding.bottom} stroke="var(--line-strong)" strokeDasharray="3 3" />
          )}
          {y.domain !== "unit" && yMin < 0 && yMax > 0 && (
            <line x1={padding.left} y1={scaleY(0)} x2={width - padding.right} y2={scaleY(0)} stroke="var(--line-strong)" strokeDasharray="3 3" />
          )}
          {midlines && (
            <g stroke="var(--line-strong)" strokeDasharray="3 3">
              <line x1={scaleX((xMin + xMax) / 2)} y1={padding.top} x2={scaleX((xMin + xMax) / 2)} y2={height - padding.bottom} />
              <line x1={padding.left} y1={scaleY((yMin + yMax) / 2)} x2={width - padding.right} y2={scaleY((yMin + yMax) / 2)} />
            </g>
          )}
          <rect
            x={padding.left}
            y={padding.top}
            width={innerWidth}
            height={innerHeight}
            fill="none"
            stroke="var(--line-strong)"
          />

          {/* Título de cada eje y lo que hay en sus extremos. */}
          <text x={padding.left + innerWidth / 2} y={height - 10} fontSize={11} fill="var(--axis-ink)" textAnchor="middle" fontWeight={600}>
            {x.label}
          </text>
          {x.lowHint && (
            <text x={padding.left} y={height - 10} fontSize={10} fill="var(--axis-ink)" textAnchor="start">
              ← {x.lowHint}
            </text>
          )}
          {x.highHint && (
            <text x={width - padding.right} y={height - 10} fontSize={10} fill="var(--axis-ink)" textAnchor="end">
              {x.highHint} →
            </text>
          )}
          <text
            x={-(padding.top + innerHeight / 2)}
            y={16}
            fontSize={11}
            fill="var(--axis-ink)"
            textAnchor="middle"
            transform="rotate(-90)"
            fontWeight={600}
          >
            {y.label}
          </text>
          {y.lowHint && (
            <text x={-(padding.top + innerHeight)} y={16} fontSize={10} fill="var(--axis-ink)" textAnchor="start" transform="rotate(-90)">
              ← {y.lowHint}
            </text>
          )}
          {y.highHint && (
            <text x={-padding.top} y={16} fontSize={10} fill="var(--axis-ink)" textAnchor="end" transform="rotate(-90)">
              {y.highHint} →
            </text>
          )}

          {visible.map((d) => {
            const cx = scaleX(d.x);
            const cy = scaleY(d.y);
            return (
              <a
                key={d.id}
                href={`/post/${d.slug}`}
                aria-label={`${d.title}: ${x.label} ${formatValue(x, d.x)}, ${y.label} ${formatValue(y, d.y)} (${d.category.name})`}
                onMouseEnter={() => setActive(d)}
                onMouseLeave={() => setActive((cur) => (cur?.id === d.id ? null : cur))}
                onFocus={() => setActive(d)}
                onBlur={() => setActive((cur) => (cur?.id === d.id ? null : cur))}
                className="cursor-pointer outline-none focus-visible:opacity-80"
                style={{ opacity: d.faded ? 0.35 : 1 }}
              >
                <circle cx={cx} cy={cy} r={14} fill="transparent" />
                <circle cx={cx} cy={cy} r={6} fill="var(--surface)" opacity={0.95} />
                <MarkerShapeIcon shape={d.category.shape} cx={cx} cy={cy} size={9} color={d.category.color} />
              </a>
            );
          })}

          {/* El texto nuevo: anillo grueso en tinta (no en un color de
              sección, para no confundirlo con una) y etiqueta directa. */}
          {highlight && (
            <g aria-label={`${highlight.label}: ${x.label} ${formatValue(x, highlight.x)}, ${y.label} ${formatValue(y, highlight.y)}`}>
              <circle cx={scaleX(highlight.x)} cy={scaleY(highlight.y)} r={11} fill="var(--surface)" stroke="currentColor" strokeWidth={2.5} />
              <circle cx={scaleX(highlight.x)} cy={scaleY(highlight.y)} r={4} fill="currentColor" />
              <text
                x={scaleX(highlight.x) + (scaleX(highlight.x) > width - 140 ? -16 : 16)}
                y={scaleY(highlight.y)}
                dy={4}
                fontSize={12}
                fontWeight={700}
                fill="currentColor"
                textAnchor={scaleX(highlight.x) > width - 140 ? "end" : "start"}
                paintOrder="stroke"
                stroke="var(--surface)"
                strokeWidth={4}
              >
                {highlight.label}
              </text>
            </g>
          )}
        </svg>

        {tooltip && (
          <div
            className="chart-tooltip absolute z-10 -translate-x-1/2 -translate-y-full"
            style={{
              left: `${(scaleX(tooltip.x) / width) * 100}%`,
              top: `${(scaleY(tooltip.y) / height) * 100}%`,
              marginTop: -10,
            }}
          >
            <p className="max-w-[220px] font-medium">{tooltip.title}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-ink-muted">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: tooltip.category.color }} aria-hidden />
              {tooltip.category.name}
            </p>
            {tooltip.note && <p className="mt-1 max-w-[220px] text-ink-muted">{tooltip.note}</p>}
            {x.domain !== "free" && (
              <p className="tnum mt-1.5 text-ink-muted">
                {x.label} <span className="font-semibold text-ink">{formatValue(x, tooltip.x)}</span>
              </p>
            )}
            {y.domain !== "free" && (
              <p className="tnum text-ink-muted">
                {y.label} <span className="font-semibold text-ink">{formatValue(y, tooltip.y)}</span>
              </p>
            )}
          </div>
        )}
      </div>

      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
        {typesPresent.map((category) => {
          const isHidden = hidden.has(category.id);
          return (
            <li key={category.id}>
              <button type="button" onClick={() => toggle(category.id)} aria-pressed={!isHidden} className={`chip ${isHidden ? "opacity-40" : ""}`}>
                <svg width={12} height={12} viewBox="0 0 12 12" aria-hidden>
                  <MarkerShapeIcon shape={category.shape} cx={6} cy={6} size={9} color={category.color} />
                </svg>
                {category.name}
              </button>
            </li>
          );
        })}
        {highlight && (
          <li className="chip pointer-events-none">
            <svg width={12} height={12} viewBox="0 0 12 12" aria-hidden>
              <circle cx={6} cy={6} r={4.5} fill="none" stroke="currentColor" strokeWidth={2} />
            </svg>
            {highlight.label}
          </li>
        )}
      </ul>

      <details className="table-toggle mt-3 text-sm">
        <summary className="cursor-pointer text-ink-muted hover:text-ink">Ver como tabla</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[480px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left text-ink-muted">
                <th className="px-2 py-2 font-medium">Post</th>
                <th className="px-2 py-2 font-medium">Sección</th>
                <th className="px-2 py-2 font-medium">{x.label}</th>
                <th className="px-2 py-2 font-medium">{y.label}</th>
              </tr>
            </thead>
            <tbody>
              {highlight && (
                <tr className="border-b border-line/60 font-semibold">
                  <td className="px-2 py-2">{highlight.label}</td>
                  <td className="px-2 py-2">—</td>
                  <td className="tnum px-2 py-2">{formatValue(x, highlight.x)}</td>
                  <td className="tnum px-2 py-2">{formatValue(y, highlight.y)}</td>
                </tr>
              )}
              {data.map((d) => (
                <tr key={d.id} className="border-b border-line/60">
                  <td className="px-2 py-2">
                    <a href={`/post/${d.slug}`} className="hover:underline">
                      {d.title}
                    </a>
                  </td>
                  <td className="px-2 py-2">{d.category.name}</td>
                  <td className="tnum px-2 py-2">{formatValue(x, d.x)}</td>
                  <td className="tnum px-2 py-2">{formatValue(y, d.y)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
