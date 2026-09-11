import Link from "next/link";
import { formatNumber, formatPercent } from "@/lib/display";
import { postTypeStyle } from "@/lib/post-type-style";
import { matchPostType } from "@/lib/post-types";
import type { CurrentMetric } from "@/lib/supabase/types";

// La lista de posts como tabla ordenable en vez de párrafos apilados: con las
// métricas en columna se comparan de un vistazo, y la cabecera ordena por
// cualquiera de ellas.

export const SORTABLE_COLUMNS = {
  published_at: { label: "Fecha", format: "date" },
  views: { label: "Views", format: "number" },
  open_rate: { label: "Open rate", format: "percent" },
  new_subscribers: { label: "Nuevos subs", format: "number" },
  engagement: { label: "Engagement", format: "percent" },
} as const;

export type SortColumn = keyof typeof SORTABLE_COLUMNS;
export type SortDirection = "asc" | "desc";

export function parseSort(orden: string | undefined, dir: string | undefined): { column: SortColumn; direction: SortDirection } {
  const column = (orden && orden in SORTABLE_COLUMNS ? orden : "published_at") as SortColumn;
  return { column, direction: dir === "asc" ? "asc" : "desc" };
}

export function sortPosts(rows: CurrentMetric[], column: SortColumn, direction: SortDirection): CurrentMetric[] {
  const sign = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a[column];
    const bv = b[column];
    // Los nulos van siempre al final, en cualquier dirección: "sin dato" no
    // es ni el máximo ni el mínimo, y dejarlo arriba tapa lo que sí se midió.
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * sign;
    return String(av).localeCompare(String(bv)) * sign;
  });
}

export function PostsTable({
  rows,
  column,
  direction,
  sortHref,
}: {
  rows: CurrentMetric[];
  column: SortColumn;
  direction: SortDirection;
  // Se recibe como función porque esta tabla es un server component: quien la
  // usa ya tiene los searchParams y sabe cómo componer el enlace.
  sortHref: (column: SortColumn) => string;
}) {
  return (
    <div className="panel overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left">
            <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-ink-muted">
              Post
            </th>
            {(Object.keys(SORTABLE_COLUMNS) as SortColumn[]).map((key) => {
              const isActive = key === column;
              return (
                <th
                  key={key}
                  scope="col"
                  aria-sort={isActive ? (direction === "asc" ? "ascending" : "descending") : "none"}
                  className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-ink-muted"
                >
                  <Link
                    href={sortHref(key)}
                    scroll={false}
                    className={`inline-flex items-center gap-1 hover:text-ink ${isActive ? "text-blue" : ""}`}
                  >
                    {SORTABLE_COLUMNS[key].label}
                    <span aria-hidden className={isActive ? "" : "opacity-0 group-hover:opacity-40"}>
                      {isActive ? (direction === "asc" ? "↑" : "↓") : "↕"}
                    </span>
                  </Link>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((post) => {
            const canonical = matchPostType(post.post_type);
            const color = canonical ? postTypeStyle(canonical).color : "var(--line-strong)";
            return (
              <tr key={post.post_id} className="border-b border-line/60 transition-colors last:border-0 hover:bg-surface/70">
                <td className="px-4 py-3">
                  <Link href={`/post/${post.slug}`} className="font-medium text-ink hover:text-blue hover:underline">
                    {post.title}
                  </Link>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
                    {/* El punto de color es el mismo que este tipo usa en los
                        charts; el nombre va al lado porque el color por sí
                        solo no puede cargar la identidad. */}
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} aria-hidden />
                      {post.post_type ?? "Sin tipo"}
                    </span>
                    {post.author && <span>· {post.author}</span>}
                  </p>
                </td>
                <td className="tnum whitespace-nowrap px-4 py-3 text-right text-ink-secondary">
                  {post.published_at ?? "—"}
                </td>
                <td className="tnum px-4 py-3 text-right font-medium">{formatNumber(post.views)}</td>
                <td className="tnum px-4 py-3 text-right font-medium">{formatPercent(post.open_rate)}</td>
                <td className="tnum px-4 py-3 text-right font-medium">{formatNumber(post.new_subscribers)}</td>
                <td className="tnum px-4 py-3 text-right font-medium">{formatPercent(post.engagement)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && (
        <p className="px-4 py-10 text-center text-sm text-ink-muted">
          Ningún post cae dentro de este recorte.
        </p>
      )}
    </div>
  );
}
