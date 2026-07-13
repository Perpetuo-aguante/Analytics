import Link from "next/link";
import { getCurrentMetrics, getFilterOptions } from "@/lib/queries";
import { formatNumber, formatPercent } from "@/lib/display";

type SearchParams = { q?: string; tema?: string; tipo?: string };

export default async function HomePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const [metrics, options] = await Promise.all([
    getCurrentMetrics({ q: params.q, topic: params.tema, postType: params.tipo }),
    getFilterOptions(),
  ]);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-16">
      <header className="mb-12">
        <p className="text-sm uppercase tracking-wide text-muted">Perpetuo</p>
        <h1 className="mt-1 font-serif text-3xl font-semibold">Analítica de publicaciones</h1>
      </header>

      <form method="GET" className="mb-10 flex flex-wrap gap-3">
        <input
          type="text"
          name="q"
          defaultValue={params.q ?? ""}
          placeholder="Buscar por título…"
          className="min-w-[220px] flex-1 rounded border border-border bg-transparent px-3 py-2 text-sm"
        />
        <select name="tema" defaultValue={params.tema ?? ""} className="rounded border border-border bg-transparent px-3 py-2 text-sm">
          <option value="">Todos los temas</option>
          {options.topics.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select name="tipo" defaultValue={params.tipo ?? ""} className="rounded border border-border bg-transparent px-3 py-2 text-sm">
          <option value="">Todos los tipos</option>
          {options.postTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded bg-foreground px-4 py-2 text-sm font-medium text-background">
          Filtrar
        </button>
      </form>

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
