"use client";

import { useId, useState } from "react";
import { niceTicks } from "@/lib/chart-scale";
import { formatNumber, formatPercent } from "@/lib/display";
import { LEADERBOARD_POST_TYPES, type LeaderboardPostType } from "@/lib/post-types";
import { postTypeStyle } from "@/lib/post-type-style";
import { MarkerShapeIcon } from "./marker-shape";

export type ScatterDatum = {
  id: string;
  title: string;
  postType: LeaderboardPostType;
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

export function ScatterChart({
  data,
  xLabel,
  yLabel,
  xFormat = "number",
  yFormat = "number",
  width = 640,
  height = 440,
}: {
  data: ScatterDatum[];
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
  const [hidden, setHidden] = useState<Set<LeaderboardPostType>>(() => new Set());
  const [active, setActive] = useState<ScatterDatum | null>(null);

  const typesPresent = LEADERBOARD_POST_TYPES.filter((t) => data.some((d) => d.postType === t));

  function toggle(type: LeaderboardPostType) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  const padding = { top: 16, right: 20, bottom: 44, left: 64 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const xTicks = niceTicks(0, Math.max(1, ...data.map((d) => d.x)), 5);
  const yTicks = niceTicks(0, Math.max(1, ...data.map((d) => d.y)), 5);
  const xMax = xTicks[xTicks.length - 1];
  const yMax = yTicks[yTicks.length - 1];

  const scaleX = (v: number) => padding.left + (v / xMax) * innerWidth;
  const scaleY = (v: number) => padding.top + innerHeight - (v / yMax) * innerHeight;

  const visible = data.filter((d) => !hidden.has(d.postType));

  return (
    <div className="w-full">
      <div className="relative">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full text-foreground" role="img" aria-labelledby={titleId}>
          <title id={titleId}>{`${yLabel} vs. ${xLabel}`}</title>

          {yTicks.map((t) => (
            <g key={`y-${t}`}>
              <line
                x1={padding.left}
                y1={scaleY(t)}
                x2={width - padding.right}
                y2={scaleY(t)}
                stroke="currentColor"
                strokeOpacity={0.1}
              />
              <text x={padding.left - 8} y={scaleY(t)} dy={3} fontSize={11} fill="currentColor" opacity={0.6} textAnchor="end">
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
              fill="currentColor"
              opacity={0.6}
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
            stroke="currentColor"
            strokeOpacity={0.25}
          />
          <line x1={padding.left} y1={padding.top} x2={padding.left} y2={height - padding.bottom} stroke="currentColor" strokeOpacity={0.25} />

          <text x={(width - padding.right + padding.left) / 2} y={height - 6} fontSize={11} fill="currentColor" opacity={0.6} textAnchor="middle">
            {xLabel}
          </text>
          <text
            x={-((height - padding.bottom + padding.top) / 2)}
            y={14}
            fontSize={11}
            fill="currentColor"
            opacity={0.6}
            textAnchor="middle"
            transform="rotate(-90)"
          >
            {yLabel}
          </text>

          {visible.map((d) => {
            const style = postTypeStyle(d.postType);
            const cx = scaleX(d.x);
            const cy = scaleY(d.y);
            return (
              <g
                key={d.id}
                tabIndex={0}
                role="img"
                aria-label={`${d.title}: ${xLabel} ${formatX(d.x)}, ${yLabel} ${formatY(d.y)} (${d.postType})`}
                onMouseEnter={() => setActive(d)}
                onMouseLeave={() => setActive((cur) => (cur?.id === d.id ? null : cur))}
                onFocus={() => setActive(d)}
                onBlur={() => setActive((cur) => (cur?.id === d.id ? null : cur))}
                className="cursor-pointer outline-none focus-visible:opacity-80"
              >
                <circle cx={cx} cy={cy} r={12} fill="transparent" />
                <circle cx={cx} cy={cy} r={6} fill="var(--background)" opacity={0.9} />
                <MarkerShapeIcon shape={style.shape} cx={cx} cy={cy} size={9} color={style.color} />
              </g>
            );
          })}
        </svg>

        {active && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-border bg-background px-3 py-2 text-xs shadow-md"
            style={{
              left: `${(scaleX(active.x) / width) * 100}%`,
              top: `${(scaleY(active.y) / height) * 100}%`,
              marginTop: -10,
            }}
          >
            <p className="font-medium">{active.title}</p>
            <p className="mt-0.5 text-muted">{active.postType}</p>
            <p className="mt-1 text-muted">
              {xLabel}: <span className="font-medium text-foreground">{formatX(active.x)}</span>
            </p>
            <p className="text-muted">
              {yLabel}: <span className="font-medium text-foreground">{formatY(active.y)}</span>
            </p>
          </div>
        )}
      </div>

      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
        {typesPresent.map((type) => {
          const style = postTypeStyle(type);
          const isHidden = hidden.has(type);
          return (
            <li key={type}>
              <button
                type="button"
                onClick={() => toggle(type)}
                aria-pressed={!isHidden}
                className={`flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 transition-opacity ${
                  isHidden ? "opacity-40" : ""
                }`}
              >
                <svg width={12} height={12} viewBox="0 0 12 12" aria-hidden>
                  <MarkerShapeIcon shape={style.shape} cx={6} cy={6} size={9} color={style.color} />
                </svg>
                {type}
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
                <th className="px-2 py-2 font-medium">Post</th>
                <th className="px-2 py-2 font-medium">Tipo</th>
                <th className="px-2 py-2 font-medium">{xLabel}</th>
                <th className="px-2 py-2 font-medium">{yLabel}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.id} className="border-b border-border/60">
                  <td className="px-2 py-2">{d.title}</td>
                  <td className="px-2 py-2">{d.postType}</td>
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
