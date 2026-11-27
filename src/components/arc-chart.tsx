"use client";

import { useId, useState } from "react";

// Arco emocional de un post: la valencia de cada párrafo (puntos) y la
// curva suavizada con media móvil de ventana 3 (línea), que es la que se
// clasifica en una de las seis formas de Reagan et al. (2016). Una sola
// serie: no lleva leyenda; el título de la sección la nombra.

export type ArcPoint = {
  idx: number;
  valence: number;
  emotion: string | null;
  excerpt: string;
};

function smooth(values: number[]): number[] {
  return values.map((_, i) => {
    const window = values.slice(Math.max(0, i - 1), i + 2);
    return window.reduce((a, b) => a + b, 0) / window.length;
  });
}

export function ArcChart({ points, unreliable = false }: { points: ArcPoint[]; unreliable?: boolean }) {
  const titleId = useId();
  const [active, setActive] = useState<number | null>(null);
  const width = 640;
  const height = 220;
  const pad = { top: 14, right: 16, bottom: 30, left: 40 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const n = points.length;
  const sx = (i: number) => pad.left + (n > 1 ? (i / (n - 1)) * innerW : innerW / 2);
  const sy = (v: number) => pad.top + ((1 - v) / 2) * innerH;
  const curve = smooth(points.map((p) => p.valence));
  const path = curve.map((v, i) => `${i === 0 ? "M" : "L"}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join(" ");
  const current = active != null ? points[active] : null;

  return (
    <div className="relative w-full">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-labelledby={titleId}>
        <title id={titleId}>Valencia por párrafo, de −1 a +1</title>
        {[-1, -0.5, 0, 0.5, 1].map((t) => (
          <g key={t}>
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={sy(t)}
              y2={sy(t)}
              stroke={t === 0 ? "var(--line-strong)" : "var(--line)"}
              strokeDasharray={t === 0 ? "3 3" : undefined}
            />
            <text x={pad.left - 6} y={sy(t)} dy={3} fontSize={11} fill="var(--axis-ink)" textAnchor="end">
              {t > 0 ? `+${t}` : t}
            </text>
          </g>
        ))}
        <text x={pad.left} y={height - 8} fontSize={11} fill="var(--axis-ink)">
          inicio
        </text>
        <text x={width - pad.right} y={height - 8} fontSize={11} fill="var(--axis-ink)" textAnchor="end">
          final
        </text>
        <text x={pad.left + innerW / 2} y={height - 8} fontSize={11} fill="var(--axis-ink)" textAnchor="middle">
          párrafos
        </text>

        <path d={path} fill="none" stroke="var(--blue)" strokeWidth={2} strokeDasharray={unreliable ? "6 4" : undefined} />
        {points.map((p, i) => (
          <g
            key={p.idx}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive((a) => (a === i ? null : a))}
            tabIndex={0}
            onFocus={() => setActive(i)}
            onBlur={() => setActive((a) => (a === i ? null : a))}
            className="outline-none"
            aria-label={`Párrafo ${p.idx + 1}: valencia ${p.valence.toFixed(2)}${p.emotion ? `, ${p.emotion}` : ""}`}
          >
            <rect x={sx(i) - Math.max(innerW / n / 2, 6)} y={pad.top} width={Math.max(innerW / n, 12)} height={innerH} fill="transparent" />
            <circle cx={sx(i)} cy={sy(p.valence)} r={active === i ? 5.5 : 4} fill="var(--surface)" stroke="var(--blue)" strokeWidth={2} />
          </g>
        ))}
      </svg>
      {current && active != null && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-lg"
          style={{ left: `${(sx(active) / width) * 100}%`, top: `${(sy(current.valence) / height) * 100}%`, marginTop: -10 }}
        >
          <p className="font-medium">
            Párrafo {current.idx + 1} · <span className="tnum">{current.valence > 0 ? "+" : ""}{current.valence.toFixed(2)}</span>
            {current.emotion && <> · {current.emotion}</>}
          </p>
          <p className="mt-1 max-w-[240px] text-ink-muted">{current.excerpt}</p>
        </div>
      )}
    </div>
  );
}
