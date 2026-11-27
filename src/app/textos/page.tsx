import Link from "next/link";
import { Suspense } from "react";
import { FilterBar } from "@/components/filter-bar";
import { PageHeader } from "@/components/page-header";
import { StatTiles } from "@/components/stat-tiles";
import { BarChart, type BarDatum } from "@/components/bar-chart";
import { TextMap, type TextMapDatum } from "@/components/text-map";
import { getCategories, type Category } from "@/lib/categories";
import { describeFilters, parseFilters, type FilterSearchParams, type Filters } from "@/lib/filters";
import { matchPostCategories, matchPostType } from "@/lib/post-types";
import { anchorAlerts, CONFIDENCE_FLOOR, countPendingAnalysis, getCompassCorpus, getNorms, type CompassRow } from "@/lib/compass";
import { THEMES, VOCAB, type VocabKey } from "@/lib/compass-vocab";
import { formatNumber, formatPercent } from "@/lib/display";

export const dynamic = "force-dynamic";

function inFilters(row: CompassRow, filters: Filters, categories: Category[]): boolean {
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

// Conteo por valor de un campo de vocabulario cerrado, en el orden del
// vocabulario (no por frecuencia: así el mismo valor está siempre en el
// mismo lugar al cambiar el recorte).
function distribution(rows: CompassRow[], vocab: VocabKey, get: (r: CompassRow) => string | null): BarDatum[] {
  return VOCAB[vocab]
    .map((value) => ({ label: value, value: rows.filter((r) => get(r) === value).length }))
    .filter((d) => d.value > 0);
}

const DISTRIBUTIONS: { title: string; vocab: VocabKey; get: (r: CompassRow) => string | null; note?: string }[] = [
  { title: "Narrador", vocab: "narrador", get: (r) => r.narrador, note: "Genette" },
  { title: "Tesis", vocab: "tesis", get: (r) => r.tesis },
  { title: "Estructura argumentativa", vocab: "estructura", get: (r) => r.estructura },
  { title: "Polo figurativo", vocab: "polo_dominante", get: (r) => r.polo_dominante, note: "Jakobson" },
  { title: "Orden temporal", vocab: "orden_temporal", get: (r) => r.orden_temporal },
  { title: "Apertura", vocab: "tipo_gancho", get: (r) => r.tipo_gancho },
  { title: "Cierre", vocab: "cierre", get: (r) => r.cierre },
  { title: "Arco emocional", vocab: "arco", get: (r) => r.arco, note: "Reagan et al. 2016" },
  { title: "Emoción principal", vocab: "emocion_dominante", get: (r) => r.emocion_principal, note: "la de más texto" },
  { title: "Distancia afectiva", vocab: "distancia_afectiva", get: (r) => r.distancia_afectiva },
];

const QUADRANTS = [
  { key: "rs", label: "Referencial · subjetivo", test: (r: CompassRow) => r.compass_x < 50 && r.compass_y >= 50 },
  { key: "ps", label: "Poético · subjetivo", test: (r: CompassRow) => r.compass_x >= 50 && r.compass_y >= 50 },
  { key: "ri", label: "Referencial · impersonal", test: (r: CompassRow) => r.compass_x < 50 && r.compass_y < 50 },
  { key: "pi", label: "Poético · impersonal", test: (r: CompassRow) => r.compass_x >= 50 && r.compass_y < 50 },
];

export default async function TextosPage({ searchParams }: { searchParams: Promise<FilterSearchParams> }) {
  const params = await searchParams;
  const categories = await getCategories();
  const filters = parseFilters(params, categories);

  const [corpus, norms, pending] = await Promise.all([getCompassCorpus(), getNorms(), countPendingAnalysis()]);
  const rows = corpus.filter((r) => inFilters(r, filters, categories));

  const points: TextMapDatum[] = [];
  let lowConfidence = 0;
  let alerted = 0;
  for (const row of rows) {
    const category = matchPostType(row.post_type, categories);
    if (!category) continue;
    const alerts = anchorAlerts(row, norms);
    const weak =
      Math.min(row.compass_x_confianza, row.compass_y_confianza) < CONFIDENCE_FLOOR ||
      row.campos_evidencia_invalida.some((c) => c === "eje_x" || c === "eje_y");
    if (weak) lowConfidence++;
    if (alerts.length > 0) alerted++;
    points.push({
      id: row.post_id,
      slug: row.slug,
      title: row.title,
      category,
      x: row.compass_x / 100,
      y: row.compass_y / 100,
      faded: weak,
      note: [weak ? "Confianza baja o evidencia inválida en un eje." : null, ...alerts].filter(Boolean).join(" ") || undefined,
    });
  }

  const themeWeights = new Map<string, number>();
  for (const row of rows) for (const t of row.temas) themeWeights.set(t.tema, (themeWeights.get(t.tema) ?? 0) + t.peso);
  const themes: BarDatum[] = [...themeWeights.entries()]
    .map(([tema, peso]) => ({ label: THEMES[tema] ?? tema, value: peso }))
    .sort((a, b) => b.value - a.value);

  const profiles = categories
    .map((category) => {
      const members = rows.filter((r) =>
        matchPostCategories(r.post_type, r.extra_post_types, categories).some((c) => c.id === category.id)
      );
      return {
        category,
        count: members.length,
        x: mean(members.map((m) => m.compass_x)),
        y: mean(members.map((m) => m.compass_y)),
        dificultad: mean(members.map((m) => m.dificultad)),
        valencia: mean(members.map((m) => m.valencia_media)),
      };
    })
    .filter((p) => p.count > 0);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
      <PageHeader
        title="Compass editorial"
        description="Cada post en dos ejes: referencial ↔ poético (¿apunta al mundo o a su propio lenguaje?) e impersonal ↔ subjetivo (¿cuánto está construido desde el yo que enuncia?). Debajo, su perfil literario y afectivo, y cómo rinde cada zona del plano."
        scope={describeFilters(filters)}
      />

      <Suspense fallback={<div className="mb-8 h-40" />}>
        <FilterBar filters={filters} categories={categories} />
      </Suspense>

      <div className="rise rise-1">
        <StatTiles
          tiles={[
            { label: "Posts analizados", value: formatNumber(rows.length), hint: `${formatNumber(pending.texts)} textos cargados en total` },
            {
              label: "Pendientes de análisis",
              value: formatNumber(pending.pending),
              hint: "textos nuevos o cambiados; los procesa el worker",
            },
            { label: "Confianza baja", value: formatNumber(lowConfidence), hint: "puntos atenuados en el compass" },
            { label: "Alertas de anclaje", value: formatNumber(alerted), hint: "el LLM contradice la estilometría" },
          ]}
        />
      </div>

      {corpus.length === 0 ? (
        <p className="panel p-8 text-sm text-ink-muted">
          Todavía no hay posts analizados. El agente sube los textos a <code>POST /api/ingest/texts</code> y el worker
          (<code>analysis/</code>) los analiza en batch.
        </p>
      ) : (
        <div className="space-y-6">
          <section className="panel rise rise-2 p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-lg font-semibold">El compass</h2>
                <p className="mt-1 max-w-2xl text-sm text-ink-secondary">
                  Scores de 0 a 100 según las rúbricas de cada eje. Los puntos atenuados tienen confianza menor a{" "}
                  {Math.round(CONFIDENCE_FLOOR * 100)}% o una cita de evidencia que no existe en el texto. Pasa el
                  cursor para ver las alertas.
                </p>
              </div>
              <Link href="/textos/comparar" className="btn-primary shrink-0 px-4 py-2 text-sm">
                Comparar un texto nuevo
              </Link>
            </div>
            <div className="mt-5">
              <TextMap
                data={points}
                categories={categories}
                midlines
                x={{ label: "Referencial ↔ Poético", domain: "unit", lowHint: "referencial", highHint: "poético" }}
                y={{ label: "Impersonal ↔ Subjetivo", domain: "unit", lowHint: "impersonal", highHint: "subjetivo" }}
              />
            </div>
          </section>

          <section className="panel rise rise-3 p-5 sm:p-6">
            <h2 className="font-display text-lg font-semibold">Cómo rinde cada cuadrante</h2>
            <p className="mb-5 mt-1 text-sm text-ink-secondary">
              Promedio de las métricas más recientes de los posts de cada zona del compass. Es una correlación, no una
              causa: cada cuadrante mezcla secciones, fechas y temas distintos.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-ink-muted">
                    <th className="px-2 py-2 font-medium">Cuadrante</th>
                    <th className="px-2 py-2 text-right font-medium">Posts</th>
                    <th className="px-2 py-2 text-right font-medium">Views</th>
                    <th className="px-2 py-2 text-right font-medium">Open rate</th>
                    <th className="px-2 py-2 text-right font-medium">Engagement</th>
                    <th className="px-2 py-2 text-right font-medium">Nuevos suscriptores</th>
                  </tr>
                </thead>
                <tbody>
                  {QUADRANTS.map((q) => {
                    const members = rows.filter(q.test);
                    return (
                      <tr key={q.key} className="border-b border-line/60">
                        <td className="px-2 py-2">{q.label}</td>
                        <td className="tnum px-2 py-2 text-right">{members.length}</td>
                        <td className="tnum px-2 py-2 text-right">{formatNumber(mean(members.map((m) => m.views)))}</td>
                        <td className="tnum px-2 py-2 text-right">{formatPercent(mean(members.map((m) => m.open_rate)))}</td>
                        <td className="tnum px-2 py-2 text-right">{formatPercent(mean(members.map((m) => m.engagement)))}</td>
                        <td className="tnum px-2 py-2 text-right">
                          {formatNumber(mean(members.map((m) => m.new_subscribers)))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel rise rise-3 p-5 sm:p-6">
            <h2 className="font-display text-lg font-semibold">Perfil de cada sección</h2>
            <p className="mb-5 mt-1 text-sm text-ink-secondary">
              Promedios de los posts analizados de cada sección. Valencia de −1 a +1 (baseline de pysentimiento).
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-ink-muted">
                    <th className="px-2 py-2 font-medium">Sección</th>
                    <th className="px-2 py-2 text-right font-medium">Posts</th>
                    <th className="px-2 py-2 text-right font-medium">Poético (X)</th>
                    <th className="px-2 py-2 text-right font-medium">Subjetivo (Y)</th>
                    <th className="px-2 py-2 text-right font-medium">Dificultad</th>
                    <th className="px-2 py-2 text-right font-medium">Valencia</th>
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
                      <td className="tnum px-2 py-2 text-right">{p.x == null ? "—" : Math.round(p.x)}</td>
                      <td className="tnum px-2 py-2 text-right">{p.y == null ? "—" : Math.round(p.y)}</td>
                      <td className="tnum px-2 py-2 text-right">{p.dificultad == null ? "—" : p.dificultad.toFixed(1)}</td>
                      <td className="tnum px-2 py-2 text-right">{p.valencia == null ? "—" : signed(p.valencia)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel rise rise-4 p-5 sm:p-6">
            <h2 className="font-display text-lg font-semibold">Temas</h2>
            <p className="mb-5 mt-1 text-sm text-ink-secondary">
              Suma del peso de cada tema en los posts del recorte (un post aporta, en total, hasta 1 por tema). Lo
              político vive aquí, no en los ejes.
            </p>
            <BarChart data={themes} />
          </section>

          <section className="rise rise-4 grid gap-6 md:grid-cols-2">
            {DISTRIBUTIONS.map((d) => (
              <div key={d.title} className="panel p-5">
                <h2 className="font-display text-base font-semibold">
                  {d.title}
                  {d.note && <span className="ml-2 text-xs font-normal text-ink-muted">{d.note}</span>}
                </h2>
                <div className="mt-4">
                  <BarChart data={distribution(rows, d.vocab, d.get)} />
                </div>
              </div>
            ))}
          </section>
        </div>
      )}
    </main>
  );
}

function signed(v: number): string {
  return v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2);
}
