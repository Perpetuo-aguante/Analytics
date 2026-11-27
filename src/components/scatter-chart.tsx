"use client";

// Dispersión de posts (Recharts): cada punto es un post, con color y forma
// de su tipo. Pasar el cursor muestra el post en una tarjeta flotante; un
// clic abre el post. Las líneas punteadas marcan la mediana de cada eje y
// parten el plano en cuadrantes ("pegó por todos lados", "abrió bien pero
// circuló poco"...), que es la lectura que piden los textos de Dashboards.

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMemo } from "react";
import {
  CartesianGrid,
  ReferenceLine,
  Scatter,
  ScatterChart as RScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatNumber, formatPercent } from "@/lib/display";
import type { Category } from "@/lib/categories";
import { MarkerShapeIcon } from "./marker-shape";
import {
  AXIS_TICK,
  EmptyChart,
  GRID_PROPS,
  LegendChips,
  TableToggle,
  X_AXIS_PROPS,
  Y_AXIS_PROPS,
  formatAxisValue,
  useReducedMotion,
  useSeriesToggle,
  type ChartTooltipProps,
} from "./charts/chart-kit";

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

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

type PointShapeProps = { cx?: number; cy?: number; payload?: ScatterDatum };

export function ScatterChart({
  data,
  categories,
  xLabel,
  yLabel,
  xFormat = "number",
  yFormat = "number",
  height = 420,
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
  height?: number;
  width?: number;
}) {
  const formatX = FORMATTERS[xFormat];
  const formatY = FORMATTERS[yFormat];
  const router = useRouter();
  const reduced = useReducedMotion();
  const { hidden, toggle, focused, setFocused } = useSeriesToggle();

  const typesPresent = categories.filter((c) => data.some((d) => d.category.id === c.id));
  const visible = data.filter((d) => !hidden.has(d.category.id));
  const medianX = useMemo(() => median(visible.map((d) => d.x)), [visible]);
  const medianY = useMemo(() => median(visible.map((d) => d.y)), [visible]);

  if (data.length === 0) return <EmptyChart />;

  const renderTooltip = ({ active, payload }: ChartTooltipProps) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload as ScatterDatum;
    return (
      <div className="chart-tooltip">
        <p className="chart-tooltip__title">{d.title}</p>
        <p className="flex items-center gap-1.5">
          <svg width={10} height={10} viewBox="0 0 10 10" aria-hidden>
            <MarkerShapeIcon shape={d.category.shape} cx={5} cy={5} size={8} color={d.category.color} />
          </svg>
          {d.category.name}
        </p>
        <dl className="tnum mt-1.5 grid grid-cols-[auto_1fr] gap-x-3">
          <dt>{xLabel}</dt>
          <dd className="text-right font-semibold text-ink">{formatX(d.x)}</dd>
          <dt>{yLabel}</dt>
          <dd className="text-right font-semibold text-ink">{formatY(d.y)}</dd>
        </dl>
        <p className="mt-2 border-t border-line pt-1.5 text-[0.7rem] text-ink-muted">Clic para abrir el post</p>
      </div>
    );
  };

  const renderPoint = (props: PointShapeProps) => {
    const { cx, cy, payload } = props;
    if (cx == null || cy == null || !payload) return <g />;
    const dim = focused != null && focused !== payload.category.id;
    return (
      // El área sensible (r=12) es mucho mayor que el marcador (9px): un
      // punto de 9px es imposible de acertar con el mouse, y más con el dedo.
      <g
        className="scatter-point cursor-pointer"
        style={{ opacity: dim ? 0.12 : 1 }}
        onClick={() => router.push(`/post/${payload.slug}`)}
      >
        <circle cx={cx} cy={cy} r={12} fill="transparent" />
        {/* Anillo del color de la superficie para que los puntos encimados
            se sigan distinguiendo uno de otro. */}
        <circle cx={cx} cy={cy} r={6.5} fill="var(--surface)" opacity={0.95} />
        <MarkerShapeIcon shape={payload.category.shape} cx={cx} cy={cy} size={9} color={payload.category.color} />
      </g>
    );
  };

  return (
    <div className="w-full">
      <RScatterChart
        responsive
        style={{ width: "100%", height }}
        margin={{ top: 12, right: 16, bottom: 24, left: 8 }}
      >
        <title>{`${yLabel} vs. ${xLabel}`}</title>
        <CartesianGrid {...GRID_PROPS} vertical horizontal />
        <XAxis
          type="number"
          dataKey="x"
          name={xLabel}
          {...X_AXIS_PROPS}
          tickFormatter={(v: number) => formatAxisValue(v, xFormat === "percent")}
          label={{ value: xLabel, position: "insideBottom", offset: -16, ...AXIS_TICK }}
        />
        <YAxis
          type="number"
          dataKey="y"
          name={yLabel}
          {...Y_AXIS_PROPS}
          width={56}
          tickFormatter={(v: number) => formatAxisValue(v, yFormat === "percent")}
          label={{ value: yLabel, angle: -90, position: "insideLeft", offset: 10, style: { textAnchor: "middle" }, ...AXIS_TICK }}
        />
        {medianX != null && (
          <ReferenceLine
            x={medianX}
            stroke="var(--line-strong)"
            strokeDasharray="5 5"
            label={{ value: "mediana", position: "insideTopRight", fontSize: 10, fill: "var(--axis-ink)" }}
          />
        )}
        {medianY != null && (
          <ReferenceLine
            y={medianY}
            stroke="var(--line-strong)"
            strokeDasharray="5 5"
            label={{ value: "mediana", position: "insideTopRight", fontSize: 10, fill: "var(--axis-ink)" }}
          />
        )}
        <Tooltip
          content={renderTooltip}
          cursor={{ stroke: "var(--line-strong)", strokeDasharray: "3 3" }}
          isAnimationActive={false}
        />
        {typesPresent
          .filter((c) => !hidden.has(c.id))
          .map((c) => (
            <Scatter
              key={c.id}
              name={c.name}
              data={visible.filter((d) => d.category.id === c.id)}
              shape={renderPoint}
              isAnimationActive={!reduced}
              animationDuration={700}
            />
          ))}
      </RScatterChart>

      <LegendChips
        items={typesPresent.map((c) => ({
          key: c.id,
          label: c.name,
          color: c.color,
          swatch: (
            <svg width={12} height={12} viewBox="0 0 12 12" aria-hidden>
              <MarkerShapeIcon shape={c.shape} cx={6} cy={6} size={9} color={c.color} />
            </svg>
          ),
        }))}
        hidden={hidden}
        onToggle={toggle}
        onFocus={setFocused}
      />

      <TableToggle>
        <table className="w-full min-w-[480px] border-collapse text-sm">
          <thead className="sticky top-0 bg-surface">
            <tr className="border-b border-line text-left text-ink-muted">
              <th className="px-3 py-2 font-medium">Post</th>
              <th className="px-3 py-2 font-medium">Tipo</th>
              <th className="px-3 py-2 font-medium">{xLabel}</th>
              <th className="px-3 py-2 font-medium">{yLabel}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.id} className="border-b border-line/60">
                <td className="px-3 py-2">
                  <Link href={`/post/${d.slug}`} className="hover:text-blue hover:underline">
                    {d.title}
                  </Link>
                </td>
                <td className="px-3 py-2">{d.category.name}</td>
                <td className="tnum px-3 py-2">{formatX(d.x)}</td>
                <td className="tnum px-3 py-2">{formatY(d.y)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableToggle>
    </div>
  );
}
