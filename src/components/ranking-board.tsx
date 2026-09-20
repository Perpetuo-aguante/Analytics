import Link from "next/link";
import { formatNumber, formatPercent } from "@/lib/display";
import { matchPostType } from "@/lib/post-types";
import type { Category } from "@/lib/categories";
import type { RankingMetric } from "@/lib/metrics";
import type { CurrentMetric } from "@/lib/supabase/types";

// El ranking como barras horizontales en vez de una lista numerada: la
// diferencia entre el 1º y el 5º se ve, no hay que restar dos números
// mentalmente. Es "verlo en un plano".
//
// Especificaciones de marca (skill dataviz): barra ≤24px de grosor, extremo
// de dato redondeado 4px y cuadrado en la línea base, valor etiquetado en la
// punta. Esa etiqueta directa es además el canal de alivio que exige la
// paleta: tres de los siete colores de sección quedan bajo 3:1 de contraste
// sobre el crema, así que el valor nunca depende del color de la barra.

export function RankingBoard({
  title,
  subtitle,
  rows,
  metric,
  accentColor,
  categories,
}: {
  title: string;
  subtitle?: string;
  rows: CurrentMetric[];
  metric: RankingMetric;
  // Cuando el board es de una sola sección, todas las barras comparten su
  // color. Si no se pasa, cada barra toma el color de su propia sección.
  accentColor?: string;
  categories: Category[];
}) {
  const format = metric.format === "percent" ? formatPercent : formatNumber;
  const values = rows.map((r) => r[metric.column] as number);
  const max = Math.max(...values, 0) || 1;

  return (
    <section className="panel p-5">
      <div className="mb-4">
        <h2 className="font-display text-base font-semibold">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-ink-muted">{subtitle}</p>}
      </div>

      {rows.length === 0 ? (
        <p className="py-6 text-sm text-ink-muted">Sin datos para este recorte.</p>
      ) : (
        <ol className="space-y-3">
          {rows.map((row, i) => {
            const value = row[metric.column] as number;
            const canonical = matchPostType(row.post_type, categories);
            const color = accentColor ?? (canonical ? canonical.color : "var(--blue)");
            return (
              <li key={row.post_id}>
                <div className="flex items-baseline justify-between gap-3">
                  <Link
                    href={`/post/${row.slug}`}
                    className="line-clamp-1 text-sm text-ink hover:text-blue hover:underline"
                    title={row.title}
                  >
                    <span className="tnum mr-2 text-ink-muted">{i + 1}</span>
                    {row.title}
                  </Link>
                  <span className="tnum shrink-0 text-sm font-semibold">{format(value)}</span>
                </div>
                {/* El riel hace de escala: la barra se lee contra el máximo
                    del board, no contra el ancho de la tarjeta. */}
                <div className="mt-1.5 h-2 w-full rounded-full bg-surface-sunk">
                  <div
                    className="h-2 rounded-l-none rounded-r-[4px]"
                    style={{
                      width: `${Math.max((value / max) * 100, 1.5)}%`,
                      background: color,
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
