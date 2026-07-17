import Link from "next/link";
import { getLeaderboards, getLeaderboardsByType } from "@/lib/queries";
import { formatNumber, formatPercent } from "@/lib/display";
import { LEADERBOARD_POST_TYPES } from "@/lib/post-types";
import type { CurrentMetric } from "@/lib/supabase/types";

// Sin esto, Next intentaría generar esta página una sola vez en el build y
// dejarla fija; queremos que consulte Supabase en cada visita.
export const dynamic = "force-dynamic";

type SearchParams = { vista?: string };

export default async function RankingsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { vista } = await searchParams;
  const showAll = vista === "todos";
  const [{ bySubscribers, byViews, byEngagement }, byType] = await Promise.all([
    getLeaderboards(showAll ? null : 10),
    getLeaderboardsByType(showAll ? null : 5),
  ]);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-16">
      <header className="mb-12">
        <p className="text-sm uppercase tracking-wide text-muted">Perpetuo</p>
        <h1 className="mt-1 font-serif text-3xl font-semibold">Rankings</h1>
        <p className="mt-2 text-sm text-muted">Basado en el snapshot más reciente de cada post.</p>
      </header>

      <div className="mb-8 flex gap-2 text-sm">
        <Link href="/rankings" data-active={!showAll} className="btn-secondary">
          Top 10
        </Link>
        <Link href="/rankings?vista=todos" data-active={showAll} className="btn-secondary">
          Ver todos
        </Link>
      </div>

      <div className="grid gap-12 sm:grid-cols-3">
        <Leaderboard title="Nuevos suscriptores" rows={bySubscribers} metric="new_subscribers" format={formatNumber} scroll={showAll} />
        <Leaderboard title="Views" rows={byViews} metric="views" format={formatNumber} scroll={showAll} />
        <Leaderboard title="Engagement" rows={byEngagement} metric="engagement" format={formatPercent} scroll={showAll} />
      </div>

      <section className="mt-16">
        <h2 className="mb-1 font-serif text-xl font-semibold">Ranking por tipo de publicación</h2>
        <p className="mb-8 text-sm text-muted">Los posts con más views dentro de cada tipo.</p>
        <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-3">
          {LEADERBOARD_POST_TYPES.map((type) => (
            <Leaderboard key={type} title={type} rows={byType[type]} metric="views" format={formatNumber} scroll={showAll} />
          ))}
        </div>
      </section>
    </main>
  );
}

function Leaderboard({
  title,
  rows,
  metric,
  format,
  scroll,
}: {
  title: string;
  rows: CurrentMetric[];
  metric: keyof CurrentMetric;
  format: (value: number | null | undefined) => string;
  scroll?: boolean;
}) {
  return (
    <section>
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
      <ol className={`space-y-3 ${scroll ? "max-h-[32rem] overflow-y-auto pr-2" : ""}`}>
        {rows.map((row, i) => (
          <li key={row.post_id} className="flex items-baseline justify-between gap-3">
            <span className="text-sm">
              <span className="mr-2 text-muted">{i + 1}.</span>
              <Link href={`/post/${row.slug}`} className="hover:underline">
                {row.title}
              </Link>
            </span>
            <span className="whitespace-nowrap text-sm font-medium">{format(row[metric] as number | null)}</span>
          </li>
        ))}
        {rows.length === 0 && <p className="text-sm text-muted">Sin datos todavía.</p>}
      </ol>
    </section>
  );
}
