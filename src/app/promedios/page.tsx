import { Suspense } from "react";
import { FilterBar } from "@/components/filter-bar";
import { PageHeader } from "@/components/page-header";
import { StatTiles } from "@/components/stat-tiles";
import { LineChart } from "@/components/line-chart";
import { aggregateMetrics, getFilteredMetrics, getMovingAverages } from "@/lib/queries";
import { getCategories } from "@/lib/categories";
import { parseFilters, describeFilters, type FilterSearchParams } from "@/lib/filters";
import { formatNumber, formatPercent } from "@/lib/display";

export const dynamic = "force-dynamic";

export default async function PromediosPage({ searchParams }: { searchParams: Promise<FilterSearchParams> }) {
  const params = await searchParams;
  const categories = await getCategories();
  const filters = parseFilters(params, categories);

  const [rows, movingAverages] = await Promise.all([
    getFilteredMetrics(filters, categories),
    getMovingAverages(filters, categories),
  ]);
  const aggregate = aggregateMetrics(rows);

  const charts = [
    { label: "Open rate", points: movingAverages.map((p) => ({ date: p.date, value: p.avgOpenRate })), percent: true },
    { label: "Engagement", points: movingAverages.map((p) => ({ date: p.date, value: p.avgEngagement })), percent: true },
    { label: "Nuevos suscriptores", points: movingAverages.map((p) => ({ date: p.date, value: p.avgNewSubscribers })), percent: false },
    { label: "Views", points: movingAverages.map((p) => ({ date: p.date, value: p.avgViews })), percent: false },
  ];

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
      <PageHeader
        title="Promedios"
        description="El promedio del recorte y su evolución histórica, suavizada con una media móvil de 3 cargas semanales para que el ruido de una semana suelta no se lea como una tendencia."
        scope={describeFilters(filters)}
      />

      <Suspense fallback={<div className="mb-8 h-40" />}>
        <FilterBar filters={filters} categories={categories} />
      </Suspense>

      <div className="rise rise-1">
        <StatTiles
          tiles={[
            { label: "Open rate promedio", value: formatPercent(aggregate.avgOpenRate) },
            { label: "Engagement promedio", value: formatPercent(aggregate.avgEngagement) },
            { label: "Nuevos subs (prom.)", value: formatNumber(aggregate.avgNewSubscribers) },
            { label: "Views (prom.)", value: formatNumber(aggregate.avgViews) },
          ]}
        />
      </div>

      <p className="mb-6 text-sm text-ink-secondary">
        {aggregate.postCount} {aggregate.postCount === 1 ? "post entra" : "posts entran"} en este recorte.
      </p>

      <section className="rise rise-2 grid gap-4 lg:grid-cols-2">
        {charts.map((chart) => (
          <div key={chart.label} className="panel p-5">
            <h2 className="mb-1 font-display text-base font-semibold">{chart.label}</h2>
            <p className="mb-4 text-xs text-ink-muted">Media móvil de 3 cargas</p>
            {chart.points.some((p) => p.value != null) ? (
              <LineChart points={chart.points} percent={chart.percent} height={170} />
            ) : (
              <p className="py-8 text-sm text-ink-muted">Sin datos suficientes para este recorte.</p>
            )}
          </div>
        ))}
      </section>
    </main>
  );
}
