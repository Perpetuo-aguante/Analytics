import { Suspense } from "react";
import { FilterBar } from "@/components/filter-bar";
import { PageHeader } from "@/components/page-header";
import { StatTiles } from "@/components/stat-tiles";
import { PostsTable, parseSort, sortPosts, type SortColumn } from "@/components/posts-table";
import { aggregateMetrics, getFilteredMetrics } from "@/lib/queries";
import { getCategories } from "@/lib/categories";
import { parseFilters, describeFilters, type FilterSearchParams } from "@/lib/filters";
import { formatNumber, formatPercent } from "@/lib/display";

export const dynamic = "force-dynamic";

type SearchParams = FilterSearchParams & { orden?: string; dir?: string };

export default async function HomePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const categories = await getCategories();
  const filters = parseFilters(params, categories);
  const { column, direction } = parseSort(params.orden, params.dir);

  const rows = await getFilteredMetrics(filters, categories);
  const totals = aggregateMetrics(rows);
  const sorted = sortPosts(rows, column, direction);

  // Tocar una cabecera ordena por esa columna; volver a tocar la misma
  // invierte la dirección, sin perder el filtro que ya estaba puesto.
  function sortHref(next: SortColumn): string {
    const search = new URLSearchParams(
      Object.entries(params).filter((entry): entry is [string, string] => typeof entry[1] === "string")
    );
    search.set("orden", next);
    search.set("dir", next === column && direction === "desc" ? "asc" : "desc");
    return `/?${search.toString()}`;
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
      <PageHeader
        title="Publicaciones"
        description="Todo lo publicado, con sus métricas más recientes. Filtra por fecha y sección arriba, ordena por cualquier columna de la tabla."
        scope={describeFilters(filters)}
      />

      <Suspense fallback={<div className="mb-8 h-40" />}>
        <FilterBar filters={filters} categories={categories} showSearch />
      </Suspense>

      <div className="rise rise-1">
        <StatTiles
          tiles={[
            { label: "Posts en el recorte", value: formatNumber(totals.postCount) },
            { label: "Views totales", value: formatNumber(totals.totalViews) },
            { label: "Nuevos suscriptores", value: formatNumber(totals.totalNewSubscribers) },
            { label: "Open rate promedio", value: formatPercent(totals.avgOpenRate) },
          ]}
        />
      </div>

      <div className="rise rise-2">
        <PostsTable rows={sorted} column={column} direction={direction} sortHref={sortHref} categories={categories} />
      </div>
    </main>
  );
}
