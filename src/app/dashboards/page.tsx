import { Suspense } from "react";
import { FilterBar } from "@/components/filter-bar";
import { PageHeader } from "@/components/page-header";
import { StatTiles } from "@/components/stat-tiles";
import { ScatterChart, type ScatterDatum } from "@/components/scatter-chart";
import { SectionTimelineChart, type TimelineSeries } from "@/components/section-timeline-chart";
import { aggregateMetrics, getFilteredMetrics, getSectionTimelines, toScatterMetrics } from "@/lib/queries";
import { getCategories } from "@/lib/categories";
import { parseFilters, describeFilters, type FilterSearchParams } from "@/lib/filters";
import { formatNumber, formatPercent } from "@/lib/display";

export const dynamic = "force-dynamic";

export default async function DashboardsPage({ searchParams }: { searchParams: Promise<FilterSearchParams> }) {
  const params = await searchParams;
  const categories = await getCategories();
  const filters = parseFilters(params, categories);

  const [rows, sectionTimelines] = await Promise.all([
    getFilteredMetrics(filters, categories),
    getSectionTimelines(filters, categories),
  ]);

  const scatterMetrics = toScatterMetrics(rows, categories);
  const totals = aggregateMetrics(rows);

  const viewsVsSubscribers: ScatterDatum[] = scatterMetrics
    .filter((m) => m.views != null && m.newSubscribers != null)
    .map((m) => ({
      id: m.postId,
      slug: m.slug,
      title: m.title,
      category: m.category,
      x: m.views as number,
      y: m.newSubscribers as number,
    }));

  const openRateVsViews: ScatterDatum[] = scatterMetrics
    .filter((m) => m.views != null && m.openRate != null)
    .map((m) => ({
      id: m.postId,
      slug: m.slug,
      title: m.title,
      category: m.category,
      x: m.views as number,
      y: m.openRate as number,
    }));

  const openRateSeries: TimelineSeries[] = sectionTimelines.map(({ category, points }) => ({
    category,
    points: points.map((p) => ({ date: p.date, value: p.openRate })),
  }));

  const cumulativeViewsSeries: TimelineSeries[] = sectionTimelines.map(({ category, points }) => ({
    category,
    points: points.map((p) => ({ date: p.date, value: p.views })),
  }));

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
      <PageHeader
        title="Dashboards"
        description="El plano completo: cada punto es un post, cada línea una sección. El recorte de arriba manda sobre todos los charts a la vez, así que lo que ves en uno siempre cuadra con lo que ves en el otro."
        scope={describeFilters(filters)}
      />

      <Suspense fallback={<div className="mb-8 h-40" />}>
        <FilterBar filters={filters} categories={categories} />
      </Suspense>

      <div className="rise rise-1">
        <StatTiles
          tiles={[
            { label: "Posts en el recorte", value: formatNumber(totals.postCount) },
            { label: "Views (prom.)", value: formatNumber(totals.avgViews) },
            { label: "Open rate (prom.)", value: formatPercent(totals.avgOpenRate) },
            { label: "Engagement (prom.)", value: formatPercent(totals.avgEngagement) },
          ]}
        />
      </div>

      {rows.length === 0 ? (
        <p className="panel p-8 text-sm text-ink-muted">
          Ningún post cae dentro de este recorte. Prueba a ampliar el rango de fechas o a quitar secciones.
        </p>
      ) : (
        <div className="space-y-6">
          <section className="panel rise rise-2 p-5 sm:p-6">
            <h2 className="font-display text-lg font-semibold">Open rate vs. views</h2>
            <p className="mb-5 mt-1 text-sm text-ink-secondary">
              Arriba a la derecha está lo que pegó por todos lados. Arriba a la izquierda, lo que abrió muy bien
              pero circuló poco: candidatos a volver a empujar.
            </p>
            <ScatterChart data={openRateVsViews} categories={categories} xLabel="Views" yLabel="Open rate" yFormat="percent" />
          </section>

          <section className="panel rise rise-3 p-5 sm:p-6">
            <h2 className="font-display text-lg font-semibold">Views vs. nuevos suscriptores</h2>
            <p className="mb-5 mt-1 text-sm text-ink-secondary">
              Qué posts convierten lectura en suscripción, y cuáles se leen mucho sin dejar nadie atrás.
            </p>
            <ScatterChart data={viewsVsSubscribers} categories={categories} xLabel="Views" yLabel="Nuevos suscriptores" />
          </section>

          <section className="panel rise rise-4 p-5 sm:p-6">
            <h2 className="font-display text-lg font-semibold">Open rate por sección, carga a carga</h2>
            <p className="mb-5 mt-1 text-sm text-ink-secondary">
              Promedio de open rate en cada carga semanal. Sin secciones seleccionadas arriba se muestran las tres
              que salen por newsletter.
            </p>
            <SectionTimelineChart series={openRateSeries} percent />
          </section>

          <section className="panel rise rise-4 p-5 sm:p-6">
            <h2 className="font-display text-lg font-semibold">Views acumuladas por sección</h2>
            <p className="mb-5 mt-1 text-sm text-ink-secondary">
              Suma de views de todos los posts de cada sección, por carga semanal.
            </p>
            <SectionTimelineChart series={cumulativeViewsSeries} />
          </section>
        </div>
      )}
    </main>
  );
}
