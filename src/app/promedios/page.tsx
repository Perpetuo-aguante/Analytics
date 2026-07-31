import Link from "next/link";
import { getAggregateMetrics, getFilterOptions, getMovingAverages } from "@/lib/queries";
import { formatNumber, formatPercent } from "@/lib/display";
import { DateRangePresets } from "@/components/date-range-presets";
import { LineChart } from "@/components/line-chart";

type SearchParams = { tipo?: string; desde?: string; hasta?: string };

export default async function PromediosPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const hasFilters = Boolean(params.tipo || params.desde || params.hasta);

  const filters = { postType: params.tipo, publishedFrom: params.desde, publishedTo: params.hasta };
  const [aggregate, movingAverages, options] = await Promise.all([
    getAggregateMetrics(filters),
    getMovingAverages(filters),
    getFilterOptions(),
  ]);

  const inputClass =
    "rounded-full border border-border bg-white/50 px-4 py-2 text-sm outline-none focus:border-accent";

  const tiles = [
    { label: "Open rate promedio", value: formatPercent(aggregate.avgOpenRate) },
    { label: "Engagement promedio", value: formatPercent(aggregate.avgEngagement) },
    { label: "Nuevos suscriptores (prom.)", value: formatNumber(aggregate.avgNewSubscribers) },
    { label: "Views (prom.)", value: formatNumber(aggregate.avgViews) },
  ];

  const charts = [
    { label: "Media móvil — Open rate", points: movingAverages.map((p) => ({ date: p.date, value: p.avgOpenRate })), percent: true },
    { label: "Media móvil — Engagement", points: movingAverages.map((p) => ({ date: p.date, value: p.avgEngagement })), percent: true },
    { label: "Media móvil — Nuevos suscriptores", points: movingAverages.map((p) => ({ date: p.date, value: p.avgNewSubscribers })), percent: false },
    { label: "Media móvil — Views", points: movingAverages.map((p) => ({ date: p.date, value: p.avgViews })), percent: false },
  ];

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-16">
      <header className="mb-12">
        <p className="text-sm uppercase tracking-wide text-muted">Perpetuo</p>
        <h1 className="mt-1 font-serif text-3xl font-semibold">Promedios</h1>
        <p className="mt-2 text-sm text-muted">
          Promedio agregado de open rate, engagement, nuevos suscriptores y views, con su evolución histórica
          (media móvil de 3 cargas semanales). Filtrable por tipo de post y por fecha de publicación.
        </p>
      </header>

      <form method="GET" className="mb-10 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <select name="tipo" defaultValue={params.tipo ?? ""} className={inputClass}>
            <option value="">Todos los tipos</option>
            {options.postTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-muted">
            Publicado desde
            <input type="date" name="desde" defaultValue={params.desde ?? ""} className={inputClass} />
          </label>
          <label className="flex items-center gap-2 text-sm text-muted">
            hasta
            <input type="date" name="hasta" defaultValue={params.hasta ?? ""} className={inputClass} />
          </label>
          <button type="submit" className="btn-primary text-sm">
            Filtrar
          </button>
          {hasFilters && (
            <Link href="/promedios" className="text-sm text-muted underline hover:text-foreground">
              Limpiar filtros
            </Link>
          )}
        </div>

        <DateRangePresets currentParams={params} />
      </form>

      <p className="mb-6 text-sm text-muted">
        {aggregate.postCount} {aggregate.postCount === 1 ? "post coincide" : "posts coinciden"} con los filtros.
      </p>

      <section className="mb-16 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-2xl border border-border p-4">
            <p className="text-xs text-muted">{tile.label}</p>
            <p className="mt-1 font-serif text-2xl font-semibold">{tile.value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-10 sm:grid-cols-2">
        {charts.map((chart) => (
          <div key={chart.label}>
            <h2 className="mb-3 text-sm font-medium">{chart.label}</h2>
            {chart.points.some((p) => p.value != null) ? (
              <LineChart points={chart.points} percent={chart.percent} height={160} />
            ) : (
              <p className="text-sm text-muted">Sin datos suficientes para este filtro.</p>
            )}
          </div>
        ))}
      </section>
    </main>
  );
}
