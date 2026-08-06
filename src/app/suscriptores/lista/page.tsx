import Link from "next/link";
import {
  getSubscriberFilterOptions,
  getSubscribers,
  type SubscriberSort,
} from "@/lib/subscriber-queries";
import { formatPercent, formatTenure } from "@/lib/display";
import { SubscriberTabs } from "../subscriber-tabs";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const SORT_OPTIONS: { value: SubscriberSort; label: string }[] = [
  { value: "antiguedad", label: "Antigüedad" },
  { value: "open_rate", label: "Open rate" },
  { value: "actividad", label: "Actividad" },
  { value: "revenue", label: "Revenue" },
  { value: "views", label: "Post views" },
];

type SearchParams = {
  q?: string;
  tipo?: string;
  pais?: string;
  seccion?: string;
  actividad?: string;
  estado?: string;
  orden?: string;
  pagina?: string;
};

export default async function SuscriptoresListaPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const minActivity = params.actividad ? Number.parseInt(params.actividad, 10) : undefined;
  const sort: SubscriberSort = SORT_OPTIONS.some((o) => o.value === params.orden)
    ? (params.orden as SubscriberSort)
    : "antiguedad";
  const status = params.estado === "activo" || params.estado === "cancelado" ? params.estado : undefined;

  const [allRows, options] = await Promise.all([
    getSubscribers(
      {
        q: params.q,
        type: params.tipo,
        country: params.pais,
        section: params.seccion,
        minActivity: minActivity != null && Number.isFinite(minActivity) ? minActivity : undefined,
        status,
      },
      sort
    ),
    getSubscriberFilterOptions(),
  ]);

  const hasFilters = Boolean(
    params.q || params.tipo || params.pais || params.seccion || params.actividad || params.estado
  );

  const totalPages = Math.max(1, Math.ceil(allRows.length / PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, Number.parseInt(params.pagina ?? "1", 10) || 1), totalPages);
  const pageRows = allRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function pageHref(page: number): string {
    const sp = new URLSearchParams();
    if (params.q) sp.set("q", params.q);
    if (params.tipo) sp.set("tipo", params.tipo);
    if (params.pais) sp.set("pais", params.pais);
    if (params.seccion) sp.set("seccion", params.seccion);
    if (params.actividad) sp.set("actividad", params.actividad);
    if (params.estado) sp.set("estado", params.estado);
    if (params.orden) sp.set("orden", params.orden);
    sp.set("pagina", String(page));
    return `/suscriptores/lista?${sp.toString()}`;
  }

  const inputClass =
    "rounded-full border border-border bg-white/50 px-4 py-2 text-sm outline-none focus:border-accent";

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-16">
      <header className="mb-8">
        <p className="text-sm uppercase tracking-wide text-muted">Perpetuo</p>
        <h1 className="mt-1 font-serif text-3xl font-semibold">Suscriptores</h1>
        <p className="mt-2 text-sm text-muted">Buscá, filtrá y ordená la base completa de suscriptores.</p>
      </header>

      <SubscriberTabs active="lista" />

      <form method="GET" className="mb-8 space-y-3">
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Buscar por email o nombre…"
            className={`min-w-[220px] flex-1 ${inputClass}`}
          />
          <select name="tipo" defaultValue={params.tipo ?? ""} className={inputClass}>
            <option value="">Todos los tipos</option>
            {options.types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select name="pais" defaultValue={params.pais ?? ""} className={inputClass}>
            <option value="">Todos los países</option>
            {options.countries.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select name="seccion" defaultValue={params.seccion ?? ""} className={inputClass}>
            <option value="">Todas las secciones</option>
            {options.sections.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select name="estado" defaultValue={params.estado ?? ""} className={inputClass}>
            <option value="">Activos y cancelados</option>
            <option value="activo">Solo activos</option>
            <option value="cancelado">Solo cancelados</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-muted">
            Actividad mín.
            <input
              type="number"
              name="actividad"
              min={0}
              max={5}
              defaultValue={params.actividad ?? ""}
              placeholder="0"
              className={`w-20 ${inputClass}`}
            />
          </label>
          <select name="orden" defaultValue={sort} className={inputClass}>
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                Ordenar por: {o.label}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-primary text-sm">
            Filtrar
          </button>
          {hasFilters && (
            <Link href="/suscriptores/lista" className="text-sm text-muted underline hover:text-foreground">
              Limpiar filtros
            </Link>
          )}
        </div>
      </form>

      <p className="mb-4 text-sm text-muted">
        {allRows.length.toLocaleString("es")} {allRows.length === 1 ? "suscriptor coincide" : "suscriptores coinciden"}{" "}
        con los filtros.
      </p>

      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="whitespace-nowrap px-4 py-3 font-medium">Email</th>
              <th className="whitespace-nowrap px-4 py-3 font-medium">Nombre</th>
              <th className="whitespace-nowrap px-4 py-3 font-medium">Tipo</th>
              <th className="whitespace-nowrap px-4 py-3 font-medium">Antigüedad</th>
              <th className="whitespace-nowrap px-4 py-3 font-medium">Open rate</th>
              <th className="whitespace-nowrap px-4 py-3 font-medium">Actividad</th>
              <th className="whitespace-nowrap px-4 py-3 font-medium">País</th>
              <th className="whitespace-nowrap px-4 py-3 font-medium">Secciones</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => (
              <tr key={row.subscriber_id} className="border-b border-border/60 last:border-0 hover:bg-accent/5">
                <td className="whitespace-nowrap px-4 py-3">
                  <Link href={`/suscriptores/${row.subscriber_id}`} className="hover:underline">
                    {row.email}
                  </Link>
                </td>
                <td className="whitespace-nowrap px-4 py-3">{row.name || "—"}</td>
                <td className="whitespace-nowrap px-4 py-3">{row.type ?? "—"}</td>
                <td className="whitespace-nowrap px-4 py-3">{formatTenure(row.tenureDays)}</td>
                <td className="whitespace-nowrap px-4 py-3">{formatPercent(row.open_rate_6mo)}</td>
                <td className="whitespace-nowrap px-4 py-3">{row.activity ?? "—"}</td>
                <td className="whitespace-nowrap px-4 py-3">{row.country || "—"}</td>
                <td className="max-w-[220px] truncate px-4 py-3" title={(row.sections ?? []).join(", ")}>
                  {(row.sections ?? []).join(", ") || "—"}
                </td>
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-muted">
                  No hay suscriptores que coincidan con la búsqueda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between text-sm">
          <Link
            href={pageHref(currentPage - 1)}
            aria-disabled={currentPage <= 1}
            className={`btn-secondary ${currentPage <= 1 ? "pointer-events-none opacity-40" : ""}`}
          >
            ← Anterior
          </Link>
          <span className="text-muted">
            Página {currentPage} de {totalPages}
          </span>
          <Link
            href={pageHref(currentPage + 1)}
            aria-disabled={currentPage >= totalPages}
            className={`btn-secondary ${currentPage >= totalPages ? "pointer-events-none opacity-40" : ""}`}
          >
            Siguiente →
          </Link>
        </div>
      )}
    </main>
  );
}
