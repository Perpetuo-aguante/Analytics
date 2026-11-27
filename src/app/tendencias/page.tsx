import Link from "next/link";
import { Suspense } from "react";
import { FilterBar } from "@/components/filter-bar";
import { PageHeader } from "@/components/page-header";
import { SectionTimelineChart, type TimelineSeries } from "@/components/section-timeline-chart";
import { getCategories } from "@/lib/categories";
import { describeFilters, parseFilters, type FilterSearchParams } from "@/lib/filters";
import {
  SECOND_LIFE_MIN_AGE_DAYS,
  SECOND_LIFE_MIN_PER_DAY,
  SECOND_LIFE_RATIO,
  getInterestOverview,
  type TrendingPost,
} from "@/lib/interest";
import { matchPostCategories } from "@/lib/post-types";
import { getFilteredMetrics } from "@/lib/queries";
import type { Category } from "@/lib/categories";

export const dynamic = "force-dynamic";

const formatRate = (v: number) => (v >= 10 ? Math.round(v).toLocaleString("es") : v.toFixed(1));

export default async function TendenciasPage({ searchParams }: { searchParams: Promise<FilterSearchParams> }) {
  const params = await searchParams;
  const categories = await getCategories();
  const filters = parseFilters(params, categories);
  const rows = await getFilteredMetrics(filters, categories);
  const overview = await getInterestOverview(rows, categories);

  const sectionSeries: TimelineSeries[] = overview.sections.map(({ category, weeks }) => ({
    category,
    points: weeks.map((w) => ({ date: w.week, value: w.newViews })),
  }));

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
      <PageHeader
        canvas="rojo"
        personaje="punto-corriendo"
        title="Tendencias"
        description="Qué está ganando lectores ahora y qué temas vuelven a circular. Se calcula con las vistas nuevas entre una carga y la siguiente."
        scope={describeFilters(filters)}
      />
      <Suspense fallback={<div className="mb-8 h-40" />}>
        <FilterBar filters={filters} categories={categories} />
      </Suspense>

      {overview.latestUpload == null ? (
        <p className="panel p-4 text-sm text-ink-muted">Todavía no hay cargas de métricas en este recorte.</p>
      ) : (
        <>
          <section className="mb-16">
            <h2 className="mb-1 font-display text-2xl font-bold">En alza ahora</h2>
            <p className="mb-6 max-w-3xl text-sm text-ink-muted">
              Los posts con más vistas nuevas por día entre las dos últimas cargas (hasta el {overview.latestUpload}).
            </p>
            <TrendingList posts={overview.rising} categories={categories} />
          </section>

          <section className="mb-16">
            <h2 className="mb-1 font-display text-2xl font-bold">Segunda vida</h2>
            <p className="mb-6 max-w-3xl text-sm text-ink-muted">
              Posts publicados hace más de {SECOND_LIFE_MIN_AGE_DAYS} días que en la última carga ganaron al menos{" "}
              {SECOND_LIFE_RATIO} veces su ritmo habitual (y {SECOND_LIFE_MIN_PER_DAY}+ vistas por día): señal de que el
              tema volvió a interesar.
            </p>
            {overview.secondLife.length > 0 ? (
              <TrendingList posts={overview.secondLife} categories={categories} showRatio />
            ) : (
              <p className="text-sm text-ink-muted">Ningún post viejo repuntó en la última carga.</p>
            )}
          </section>

          <section className="mb-16">
            <h2 className="mb-1 font-display text-2xl font-bold">Interés por sección, semana a semana</h2>
            <p className="mb-6 max-w-3xl text-sm text-ink-muted">
              Vistas nuevas que ganó cada sección por semana, sumando todos sus posts (los nuevos y los de archivo).
              Un post con varias secciones suma en cada una.
            </p>
            {sectionSeries.length > 0 ? (
              <SectionTimelineChart series={sectionSeries} />
            ) : (
              <p className="text-sm text-ink-muted">Hacen falta al menos dos cargas.</p>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function TrendingList({
  posts,
  categories,
  showRatio = false,
}: {
  posts: TrendingPost[];
  categories: Category[];
  showRatio?: boolean;
}) {
  if (posts.length === 0) return <p className="text-sm text-ink-muted">Sin movimiento en la última carga.</p>;
  const max = Math.max(...posts.map((p) => p.latest.perDay), 1);
  return (
    <ol className="space-y-3">
      {posts.map((t) => {
        const [category] = matchPostCategories(t.post.post_type, t.post.extra_post_types, categories);
        return (
          <li key={t.post.post_id} className="text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4">
              <Link href={`/post/${t.post.slug}`} className="font-medium hover:underline">
                {t.post.title}
              </Link>
              <span className="tnum text-ink-secondary">
                {formatRate(t.latest.perDay)} vistas/día
                {showRatio && t.ratio != null && ` · ${t.ratio.toFixed(1)}× lo habitual`}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-3">
              <div className="h-2 flex-1 rounded-full bg-surface-sunk">
                <div
                  className="h-2 rounded-r-[4px] bg-blue"
                  style={{ width: `${(t.latest.perDay / max) * 100}%` }}
                  aria-hidden
                />
              </div>
              <span className="w-48 shrink-0 truncate text-xs text-ink-muted">
                {category?.name ?? "Sin sección"}
                {t.ageDays != null && ` · hace ${t.ageDays} días`}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
