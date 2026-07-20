import Link from "next/link";
import { getCurrentMetrics, getFilterOptions } from "@/lib/queries";
import { formatNumber, formatPercent } from "@/lib/display";

type SearchParams = { q?: string; tema?: string; tipo?: string; desde?: string; hasta?: string; subs?: string };

export default async function HomePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const minSubscribers = params.subs ? Number.parseInt(params.subs, 10) : null;
  const hasFilters = Boolean(params.q || params.tema || params.tipo || params.desde || params.hasta || params.subs);

  const [metrics, options] = await Promise.all([
    getCurrentMetrics({
      q: params.q,
      topic: params.tema,
      postType: params.tipo,
      publishedFrom: params.desde,
      publishedTo: params.hasta,
      minSubscribers: minSubscribers != null && Number.isFinite(minSubscribers) ? minSubscribers : undefined,
    }),
    getFilterOptions(),
  ]);

  const inputClass =
    "rounded-full border border-border bg-white/50 px-4 py-2 text-sm outline-none focus:border-accent";

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-16">
      <header className="mb-12">
        <p className="text-sm uppercase tracking-wide text-muted">Perpetuo</p>
        <h1 className="mt-1 font-serif text-3xl font-semibold">Analítica de publicaciones</h1>
      </header>

      <form method="GET" className="mb-10 space-y-3">
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Buscar por título…"
            className={`min-w-[220px] flex-1 ${inputClass}`}
          />
          <select name="tema" defaultValue={params.tema ?? ""} className={inputClass}>
            <option value="">Todos los temas</option>
            {options.topics.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select name="tipo" defaultValue={params.tipo ?? ""} className={inputClass}>
            <option value="">Todos los tipos</option>
            {options.postTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted">
            Publicado desde
            <input type="date" name="desde" defaultValue={params.desde ?? ""} className={inputClass} />
          </label>
          <label className="flex items-center gap-2 text-sm text-muted">
            hasta
            <input type="date" name="hasta" defaultValue={params.hasta ?? ""} className={inputClass} />
          </label>
          <label className="flex items-center gap-2 text-sm text-muted">
            Suscriptores mín.
            <input
              type="number"
              name="subs"
              min={0}
              defaultValue={params.subs ?? ""}
              placeholder="0"
              className={`w-24 ${inputClass}`}
            />
          </label>
          <button type="submit" className="btn-primary text-sm">
            Filtrar
          </button>
          {hasFilters && (
            <Link href="/" className="text-sm text-muted underline hover:text-foreground">
              Limpiar filtros
            </Link>
          )}
        </div>
      </form>

      {hasFilters && (
        <p className="mb-4 text-sm text-muted">
          {metrics.length} {metrics.length === 1 ? "post coincide" : "posts coinciden"} con los filtros.
        </p>
      )}

      <ul className="divide-y divide-border">
        {metrics.map((post) => (
          <li key={post.post_id} className="py-5">
            <Link href={`/post/${post.slug}`} className="text-lg font-medium hover:underline">
              {post.title}
            </Link>
            {post.author && <p className="mt-0.5 text-sm text-muted">{post.author}</p>}
            <p className="mt-1 text-sm text-muted">
              {post.topic ?? "—"} · {post.post_type ?? "—"} · {post.published_at ?? "sin fecha"}
            </p>
            <p className="mt-1 text-sm text-muted">
              {formatNumber(post.views)} views · {formatNumber(post.new_subscribers)} nuevos suscriptores ·{" "}
              {formatPercent(post.engagement)} engagement
            </p>
          </li>
        ))}
        {metrics.length === 0 && <p className="py-8 text-sm text-muted">No hay posts que coincidan con la búsqueda.</p>}
      </ul>
    </main>
  );
}
