import Link from "next/link";
import { Suspense } from "react";
import { FilterBar } from "@/components/filter-bar";
import { PageHeader } from "@/components/page-header";
import { StatTiles } from "@/components/stat-tiles";
import { TextMap, type AxisSpec, type TextMapDatum } from "@/components/text-map";
import { formatSentiment } from "@/components/reading-bars";
import { getCategories, type Category } from "@/lib/categories";
import { describeFilters, filtersToSearchParams, parseFilters, type FilterSearchParams, type Filters } from "@/lib/filters";
import { matchPostCategories } from "@/lib/post-types";
import { getFilteredMetrics } from "@/lib/queries";
import { buildCorpusModel, getTextCorpus, type CorpusModel, type CorpusRow } from "@/lib/texts";
import { READING_KEYS, READING_LABELS, STYLE_KEYS, type LexicalMap, type ReadingKey } from "@/lib/text-analysis";
import { formatNumber } from "@/lib/display";

export const dynamic = "force-dynamic";

// Un eje del mapa: uno de los dos del mapa léxico o una de las lecturas.
type AxisKey = "lexico1" | "lexico2" | ReadingKey;
const AXIS_KEYS: AxisKey[] = ["lexico1", "lexico2", ...READING_KEYS];

// Vistas de un clic. El resto de las combinaciones, con los selectores.
const PRESETS: { label: string; x: AxisKey; y: AxisKey }[] = [
  { label: "Mapa léxico", x: "lexico1", y: "lexico2" },
  { label: "Personal × Político", x: "personal", y: "politico" },
  { label: "Ensayístico × Íntimo", x: "ensayistico", y: "intimo" },
  { label: "Sentimiento × Íntimo", x: "sentimiento", y: "intimo" },
];

function parseAxis(value: string | undefined, fallback: AxisKey): AxisKey {
  return AXIS_KEYS.includes(value as AxisKey) ? (value as AxisKey) : fallback;
}

function axisLabel(key: AxisKey): string {
  if (key === "lexico1") return "Eje léxico 1";
  if (key === "lexico2") return "Eje léxico 2";
  return READING_LABELS[key];
}

function axisSpec(key: AxisKey, map: LexicalMap | null): AxisSpec {
  if (key === "lexico1" || key === "lexico2") {
    const axis = map?.axes[key === "lexico1" ? 0 : 1];
    return {
      label: `${axisLabel(key)}${axis ? ` (${Math.round(axis.explained * 100)}% de la variación)` : ""}`,
      domain: "free",
      lowHint: axis?.negative.slice(0, 3).join(", "),
      highHint: axis?.positive.slice(0, 3).join(", "),
    };
  }
  return { label: READING_LABELS[key], domain: key === "sentimiento" ? "signed" : "unit" };
}

function axisValue(key: AxisKey, row: CorpusRow, coords: [number, number] | undefined): number | null {
  if (key === "lexico1") return coords?.[0] ?? null;
  if (key === "lexico2") return coords?.[1] ?? null;
  return row.reading?.[key] ?? null;
}

function inFilters(row: CorpusRow, filters: Filters, categories: Category[]): boolean {
  if (filters.from && (!row.published_at || row.published_at < filters.from)) return false;
  if (filters.to && (!row.published_at || row.published_at > filters.to)) return false;
  if (filters.q && !row.title.toLowerCase().includes(filters.q.toLowerCase())) return false;
  if (filters.types.length > 0) {
    return matchPostCategories(row.post_type, row.extra_post_types, categories).some((c) => filters.types.includes(c.name));
  }
  return true;
}

function mean(values: (number | null | undefined)[]): number | null {
  const present = values.filter((v): v is number => v != null);
  return present.length > 0 ? present.reduce((a, b) => a + b, 0) / present.length : null;
}

export default async function TextosPage({
  searchParams,
}: {
  searchParams: Promise<FilterSearchParams & { x?: string; y?: string }>;
}) {
  const params = await searchParams;
  const categories = await getCategories();
  const filters = parseFilters(params, categories);
  const xKey = parseAxis(params.x, "lexico1");
  const yKey = parseAxis(params.y, "lexico2");

  const [corpusRows, metricRows] = await Promise.all([getTextCorpus(), getFilteredMetrics(filters, categories)]);
  // El mapa se calcula sobre TODOS los textos y el filtro solo elige qué
  // puntos se ven: así un texto no cambia de lugar al cambiar el recorte.
  const model: CorpusModel = buildCorpusModel(corpusRows, categories);
  const coordsById = new Map(model.map?.ids.map((id, i) => [id, model.map!.coords[i]]) ?? []);
  const rows = corpusRows.filter((r) => inFilters(r, filters, categories));
  const analyzed = rows.filter((r) => r.reading);

  const points: TextMapDatum[] = [];
  for (const row of rows) {
    const category = model.categoryById.get(row.post_id);
    const x = axisValue(xKey, row, coordsById.get(row.post_id));
    const y = axisValue(yKey, row, coordsById.get(row.post_id));
    if (!category || x == null || y == null) continue;
    points.push({ id: row.post_id, slug: row.slug, title: row.title, category, x, y });
  }

  const usesReading = [xKey, yKey].some((k) => k !== "lexico1" && k !== "lexico2");
  const withText = new Set(corpusRows.map((r) => r.post_id));
  const missing = metricRows.filter((m) => !withText.has(m.post_id)).length;

  // Perfil de cada sección: el promedio de cada eje entre sus textos leídos.
  const profiles = categories
    .map((category) => {
      const members = analyzed.filter((r) =>
        matchPostCategories(r.post_type, r.extra_post_types, categories).some((c) => c.id === category.id)
      );
      return {
        category,
        count: members.length,
        means: Object.fromEntries(READING_KEYS.map((k) => [k, mean(members.map((m) => m.reading?.[k]))])) as Record<
          ReadingKey,
          number | null
        >,
      };
    })
    .filter((p) => p.count > 0);

  const filterParams = filtersToSearchParams(filters, categories);
  const hrefFor = (x: AxisKey, y: AxisKey) => {
    const p = new URLSearchParams(filterParams);
    if (x !== "lexico1") p.set("x", x);
    if (y !== "lexico2") p.set("y", y);
    const qs = p.toString();
    return qs ? `/textos?${qs}` : "/textos";
  };

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
      <PageHeader
        title="Textos"
        description="Qué tipo de texto es cada post: su estilo (ensayístico, personal, político, íntimo), su sentimiento y a qué otros textos de Perpetuo se parece. Cada punto es un texto completo."
        scope={describeFilters(filters)}
      />

      <Suspense fallback={<div className="mb-8 h-40" />}>
        <FilterBar filters={filters} categories={categories} />
      </Suspense>

      <div className="rise rise-1">
        <StatTiles
          tiles={[
            {
              label: "Textos cargados",
              value: formatNumber(rows.length),
              hint: missing > 0 ? `${formatNumber(missing)} posts del recorte sin texto` : "todos los posts del recorte",
            },
            { label: "Con lectura de estilo", value: formatNumber(analyzed.length) },
            { label: "Palabras (prom.)", value: formatNumber(mean(rows.map((r) => r.word_count))) },
            {
              label: "Sentimiento (prom.)",
              value: (() => {
                const m = mean(analyzed.map((r) => r.reading?.sentimiento));
                return m == null ? "—" : formatSentiment(m);
              })(),
            },
          ]}
        />
      </div>

      {corpusRows.length === 0 ? (
        <p className="panel p-8 text-sm text-ink-muted">
          Todavía no hay textos cargados. El agente los sube por <code>POST /api/ingest/texts</code> (ver
          docs/ingest-api.md).
        </p>
      ) : (
        <div className="space-y-6">
          <section className="panel rise rise-2 p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-lg font-semibold">Mapa de textos</h2>
                <p className="mt-1 max-w-2xl text-sm text-ink-secondary">
                  {xKey.startsWith("lexico") && yKey.startsWith("lexico")
                    ? "Textos cerca = textos que usan las mismas palabras poco comunes. Los ejes no tienen nombre propio: las palabras de cada extremo dicen qué los separa."
                    : "Cada eje es la lectura que hizo el agente de cada texto. Solo aparecen los textos que ya tienen esa lectura."}
                </p>
              </div>
              <Link href={`/textos/comparar`} className="btn-primary shrink-0 px-4 py-2 text-sm">
                Comparar un texto nuevo
              </Link>
            </div>

            <ul className="mb-4 mt-4 flex flex-wrap gap-2 text-sm">
              {PRESETS.map((preset) => {
                const active = preset.x === xKey && preset.y === yKey;
                return (
                  <li key={preset.label}>
                    <Link href={hrefFor(preset.x, preset.y)} aria-current={active ? "true" : undefined} data-active={active} className="chip">
                      {preset.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
            <form method="get" action="/textos" className="mb-5 flex flex-wrap items-end gap-3 text-sm">
              {[...filterParams.entries()].map(([key, value]) => (
                <input key={key} type="hidden" name={key} value={value} />
              ))}
              <label className="flex flex-col gap-1">
                <span className="text-xs text-ink-muted">Eje horizontal</span>
                <select name="x" defaultValue={xKey} className="field">
                  {AXIS_KEYS.map((k) => (
                    <option key={k} value={k}>
                      {axisLabel(k)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-ink-muted">Eje vertical</span>
                <select name="y" defaultValue={yKey} className="field">
                  {AXIS_KEYS.map((k) => (
                    <option key={k} value={k}>
                      {axisLabel(k)}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className="chip">
                Ver
              </button>
            </form>

            {points.length === 0 ? (
              <p className="text-sm text-ink-muted">
                {usesReading
                  ? "Ningún texto del recorte tiene todavía la lectura de estilo que piden estos ejes."
                  : "Hacen falta al menos 3 textos para armar el mapa léxico."}
              </p>
            ) : (
              <TextMap data={points} categories={categories} x={axisSpec(xKey, model.map)} y={axisSpec(yKey, model.map)} />
            )}
          </section>

          {profiles.length > 0 && (
            <section className="panel rise rise-3 p-5 sm:p-6">
              <h2 className="font-display text-lg font-semibold">Perfil de cada sección</h2>
              <p className="mb-5 mt-1 text-sm text-ink-secondary">
                Promedio de cada eje entre los textos leídos de la sección. Estilo de 0 a 100; sentimiento de −1 a +1.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-ink-muted">
                      <th className="px-2 py-2 font-medium">Sección</th>
                      <th className="px-2 py-2 text-right font-medium">Textos</th>
                      {READING_KEYS.map((k) => (
                        <th key={k} className="px-2 py-2 text-right font-medium">
                          {READING_LABELS[k]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {profiles.map((p) => (
                      <tr key={p.category.id} className="border-b border-line/60">
                        <td className="px-2 py-2">
                          <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: p.category.color }} aria-hidden />
                          {p.category.name}
                        </td>
                        <td className="tnum px-2 py-2 text-right">{p.count}</td>
                        {STYLE_KEYS.map((k) => (
                          <td key={k} className="tnum px-2 py-2 text-right">
                            <StyleCell value={p.means[k]} />
                          </td>
                        ))}
                        <td className="tnum px-2 py-2 text-right">
                          {p.means.sentimiento == null ? "—" : formatSentiment(p.means.sentimiento)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}
    </main>
  );
}

// Número con una barrita debajo: la tabla se lee como tabla y, de un
// vistazo, como gráfico.
function StyleCell({ value }: { value: number | null }) {
  if (value == null) return <>—</>;
  return (
    <span className="inline-flex flex-col items-end gap-1">
      {Math.round(value * 100)}
      <span className="block h-1 w-12 overflow-hidden rounded-full bg-surface-sunk" aria-hidden>
        <span className="block h-full rounded-full bg-blue" style={{ width: `${value * 100}%` }} />
      </span>
    </span>
  );
}
