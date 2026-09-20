import Link from "next/link";
import { Suspense } from "react";
import { FilterBar } from "@/components/filter-bar";
import { MetricTabs } from "@/components/metric-tabs";
import { PageHeader } from "@/components/page-header";
import { RankingBoard } from "@/components/ranking-board";
import { getFilteredMetrics, leaderboard, leaderboardsByType } from "@/lib/queries";
import { getCategories } from "@/lib/categories";
import { parseFilters, describeFilters, type FilterSearchParams } from "@/lib/filters";
import { parseMetric } from "@/lib/metrics";

// El recorte relativo ("últimos 30 días") se resuelve contra la fecha de hoy
// en cada request, así que esta página nunca se puede prerenderizar.
export const dynamic = "force-dynamic";

type SearchParams = FilterSearchParams & { metrica?: string; vista?: string };

export default async function RankingsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const categories = await getCategories();
  const filters = parseFilters(params, categories);
  const metric = parseMetric(params.metrica);
  const showAll = params.vista === "todos";

  const rows = await getFilteredMetrics(filters, categories);
  const global = leaderboard(rows, metric, showAll ? null : 12);
  const byType = leaderboardsByType(rows, metric, showAll ? null : 5, categories);

  // El toggle "ver todos" se construye desde los params entrantes para que
  // conserve el filtro y la métrica que ya estaban aplicados.
  const toggleParams = new URLSearchParams(
    Object.entries(params).filter((entry): entry is [string, string] => typeof entry[1] === "string")
  );
  if (showAll) toggleParams.delete("vista");
  else toggleParams.set("vista", "todos");
  const toggleHref = toggleParams.toString() ? `/rankings?${toggleParams.toString()}` : "/rankings";

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
      <PageHeader
        title="Rankings"
        description="Qué pegó mejor. Elige el recorte de fechas y las secciones arriba, y la métrica aquí abajo: los rankings de toda la página se recalculan contra lo mismo."
        scope={describeFilters(filters)}
      />

      <Suspense fallback={<div className="mb-8 h-40" />}>
        <FilterBar filters={filters} categories={categories} />
        <MetricTabs active={metric.key} label="Rankear por" />
      </Suspense>

      <div className="mb-6 flex justify-end">
        <Link href={toggleHref} className="chip">
          {showAll ? "Ver solo el top" : "Ver la lista completa"}
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="panel p-8 text-sm text-ink-muted">
          Ningún post cae dentro de este recorte. Prueba a ampliar el rango de fechas o a quitar secciones.
        </p>
      ) : (
        <>
          <div className="rise rise-1 mb-10">
            <RankingBoard
              title={`Top global · ${metric.label}`}
              subtitle={`${rows.length} ${rows.length === 1 ? "post" : "posts"} en el recorte`}
              rows={global}
              metric={metric}
              categories={categories}
            />
          </div>

          <section className="rise rise-2">
            <h2 className="mb-1 font-display text-xl font-semibold">Por sección</h2>
            <p className="mb-5 text-sm text-ink-secondary">
              El mismo ranking partido por tipo de publicación, para comparar cada sección contra sí misma.
            </p>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {byType.map(({ category, rows: typeRows }) => (
                <RankingBoard
                  key={category.id}
                  title={category.name}
                  rows={typeRows}
                  metric={metric}
                  accentColor={category.color}
                  categories={categories}
                />
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
