import Link from "next/link";
import { ArcChart, type ArcPoint } from "@/components/arc-chart";
import { TextMap, type TextMapDatum } from "@/components/text-map";
import { getCategories } from "@/lib/categories";
import {
  anchorAlerts,
  CONFIDENCE_FLOOR,
  FEATURE_LABELS,
  getCompassCorpus,
  getPostAnalysis,
  STYLOMETRY_FEATURES,
  zScore,
  type Dimension,
} from "@/lib/compass";
import { matchPostType } from "@/lib/post-types";
import { readingMinutes } from "@/lib/text-analysis";
import { buildCorpusModel, getPostText, getTextCorpus, similarToPost } from "@/lib/texts";

// El texto del post y su análisis: compass, afecto, dimensiones literarias y
// estilometría (lo escribe el worker de analysis/), más los textos que más
// se le parecen. El texto entero solo lo ven los admins: puede ser contenido
// de pago en Substack.
export async function TextSection({ postId, slug, isAdmin }: { postId: string; slug: string; isAdmin: boolean }) {
  const text = await getPostText(postId);
  if (!text) {
    return (
      <section className="mt-12">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-ink-muted">Texto y análisis</h2>
        <p className="text-sm text-ink-muted">
          Todavía no hay texto cargado para este post. Lo sube el agente por <code>POST /api/ingest/texts</code>.
        </p>
      </section>
    );
  }

  const [analysis, corpusRows, compassRows, categories] = await Promise.all([
    getPostAnalysis(postId),
    getTextCorpus(),
    getCompassCorpus(),
    getCategories(),
  ]);
  const similar = similarToPost(buildCorpusModel(corpusRows, categories), postId, 5);
  const { literary, affect, paragraphs, stylometry, norms } = analysis;
  const dims = literary?.dimensiones ?? {};
  const stale = literary != null && literary.content_hash !== text.content_hash;
  const alerts = literary && stylometry ? anchorAlerts({ ...stylometry, compass_x: literary.compass_x, compass_y: literary.compass_y }, norms) : [];

  const mapPoints: TextMapDatum[] = [];
  for (const row of compassRows) {
    const category = matchPostType(row.post_type, categories);
    if (!category || row.post_id === postId) continue;
    mapPoints.push({ id: row.post_id, slug: row.slug, title: row.title, category, x: row.compass_x / 100, y: row.compass_y / 100, faded: true });
  }

  const arcPoints: ArcPoint[] = paragraphs
    .filter((p) => p.valencia_baseline != null)
    .map((p) => ({
      idx: p.idx,
      valence: p.valencia_baseline as number,
      emotion: p.emocion_dominante,
      excerpt: excerpt(text.body.slice(p.char_start, p.char_end)),
    }));

  return (
    <section className="mt-12 space-y-10">
      <div>
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-ink-muted">Texto y análisis</h2>
        <p className="text-sm text-ink-secondary">
          {text.word_count.toLocaleString("es")} palabras · {readingMinutes(text.word_count)} min de lectura
          {literary && (
            <>
              {" "}
              · analizado con {literary.modelo} el {literary.analyzed_at.slice(0, 10)}
              {literary.secciones > 1 && <> (por {literary.secciones} secciones)</>}
            </>
          )}
        </p>
        {!literary && <p className="mt-2 text-sm text-ink-muted">El análisis literario está pendiente: lo hace el worker en su próxima corrida.</p>}
        {stale && <p className="mt-2 text-sm text-red-700">El texto cambió después del análisis: está pendiente de re-análisis.</p>}
      </div>

      {literary && (
        <div>
          <h3 className="mb-3 font-display text-lg font-semibold">Compass editorial</h3>
          <div className="space-y-4">
            <div className="panel p-4">
              <TextMap
                data={mapPoints}
                categories={categories}
                midlines
                highlight={{ x: literary.compass_x / 100, y: literary.compass_y / 100, label: "Este post" }}
                x={{ label: "Referencial ↔ Poético", domain: "unit", lowHint: "referencial", highHint: "poético" }}
                y={{ label: "Impersonal ↔ Subjetivo", domain: "unit", lowHint: "impersonal", highHint: "subjetivo" }}
                height={420}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <AxisCard title="Referencial ↔ Poético" dim={dims.eje_x} />
              <AxisCard title="Impersonal ↔ Subjetivo" dim={dims.eje_y} />
              {alerts.length > 0 && (
                <div className="rounded-2xl border border-line p-4 text-sm md:col-span-2">
                  <p className="font-medium">⚠ Alerta de anclaje</p>
                  <ul className="mt-1 list-disc pl-5 text-ink-secondary">
                    {alerts.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                  <p className="mt-1 text-xs text-ink-muted">La estilometría contradice el score: revisar a mano.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {(affect || arcPoints.length > 0) && (
        <div>
          <h3 className="mb-3 font-display text-lg font-semibold">Afecto y arco emocional</h3>
          <div className="panel p-5">
            {affect?.ironia && (
              <p className="mb-3 rounded-xl border border-line px-3 py-2 text-sm">
                <strong>⚠ Texto irónico:</strong> la valencia es poco confiable (lo que dice en la superficie no es lo
                que quiere decir).
              </p>
            )}
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
              <Stat label="Arco" value={affect?.arco ?? (arcPoints.length < 6 ? "— (menos de 6 párrafos)" : "—")} hint={affect?.arco_ajuste != null ? `ajuste ${affect.arco_ajuste.toFixed(2)}` : undefined} />
              <Stat label="Valencia media" value={signed(affect?.valencia_media)} hint={affect?.rango_valencia != null ? `rango ${affect.rango_valencia.toFixed(2)}` : undefined} />
              <Stat label="Activación media" value={affect?.activacion_media != null ? affect.activacion_media.toFixed(2) : "—"} hint="0 a 1" />
              <Stat label="Distancia afectiva" value={affect?.distancia_afectiva ?? "—"} hint={conf(affect?.distancia_confianza)} />
            </dl>
            {arcPoints.length > 0 && (
              <div className="mt-5">
                <ArcChart points={arcPoints} unreliable={affect?.ironia ?? false} />
              </div>
            )}
            {paragraphs.some((p) => p.emocion_dominante) && (
              <div className="mt-4">
                <p className="text-xs text-ink-muted">Emoción dominante de cada párrafo, en orden (★ = la corrigió el LLM sobre el baseline):</p>
                <ol className="mt-2 flex flex-wrap gap-1.5 text-xs">
                  {paragraphs.map((p) => (
                    <li key={p.idx} className="rounded-full border border-line px-2.5 py-0.5">
                      <span className="tnum text-ink-muted">{p.idx + 1}</span> {p.emocion_dominante ?? "—"}
                      {p.emocion_fuente === "llm" && p.emocion_baseline && p.emocion_baseline !== p.emocion_llm && <span title={`baseline: ${p.emocion_baseline}`}> ★</span>}
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {affect?.distancia_evidencia && <Quote text={affect.distancia_evidencia} />}
            {affect?.ironia && affect.ironia_evidencia?.map((q) => <Quote key={q} text={q} />)}
          </div>
        </div>
      )}

      {literary && (
        <div>
          <h3 className="mb-3 font-display text-lg font-semibold">Análisis literario</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <DimensionCard title="Enunciación" theory="Genette" dim={dims.enunciacion} fields={[["Narrador", "narrador"], ["Focalización", "focalizacion"], ["Distancia", "distancia"]]} />
            <DimensionCard title="Polifonía" theory="Bajtín" dim={dims.polifonia} fields={[["Voces", "num_voces"], ["Con agencia", "voces_con_agencia"], ["Contraparte", "contraparte"]]} />
            <DimensionCard title="Tiempo" theory="Genette" dim={dims.tiempo} fields={[["Orden", "orden"], ["Ritmo dominante", "ritmo_dominante"]]} />
            <DimensionCard title="Argumentación" theory="Montaigne, Adorno" dim={dims.argumentacion} fields={[["Tesis", "tesis"], ["Estructura", "estructura"], ["Autoridad", "autoridad"]]} />
            <DimensionCard title="Figuración" theory="Jakobson" dim={dims.figuracion} fields={[["Polo dominante", "polo_dominante"], ["Campos semánticos", "campos_semanticos"]]}>
              <ImagesList dim={dims.figuracion} />
            </DimensionCard>
            <DimensionCard title="Lector implícito" theory="Iser, Eco" dim={dims.lector_implicito} fields={[["Dificultad", "dificultad"], ["Competencias", "competencias_requeridas"], ["Lector modelo", "lector_modelo"]]} />
            <DimensionCard title="Apertura" dim={dims.apertura} fields={[["Gancho", "tipo_gancho"], ["Fuerza", "fuerza_gancho"]]} />
            <DimensionCard title="Cierre" dim={dims.cierre} fields={[["Tipo", "tipo"]]} />
            <DimensionCard title="Temas" dim={dims.temas} fields={[]}>
              <ul className="mt-2 space-y-1 text-sm">
                {analysis.themes.map((t) => (
                  <li key={t.tema} className="flex items-center gap-3">
                    <span className="w-40 shrink-0">{t.nombre}</span>
                    <span className="h-2 flex-1 rounded-full bg-surface-sunk" aria-hidden>
                      <span className="block h-2 rounded-full bg-blue" style={{ width: `${t.peso * 100}%` }} />
                    </span>
                    <span className="tnum w-10 text-right text-xs">{Math.round(t.peso * 100)}%</span>
                  </li>
                ))}
              </ul>
            </DimensionCard>
            <DimensionCard title="Intertextualidad" theory="Genette, Kristeva" dim={dims.intertextualidad} fields={[]}>
              {analysis.references.length === 0 ? (
                <p className="mt-2 text-sm text-ink-muted">Sin referencias explícitas.</p>
              ) : (
                <ul className="mt-2 space-y-2 text-sm">
                  {analysis.references.map((r, i) => (
                    <li key={i}>
                      <span className="font-medium">{r.autor}</span>
                      {r.obra && <em>, {r.obra}</em>}
                      <span className="text-ink-muted"> · {r.tipo} · tradición {r.tradicion}</span>
                      {r.evidencia_invalida && <InvalidBadge />}
                    </li>
                  ))}
                </ul>
              )}
            </DimensionCard>
          </div>
        </div>
      )}

      {stylometry && (
        <div>
          <h3 className="mb-1 font-display text-lg font-semibold">Estilometría</h3>
          <p className="mb-3 text-sm text-ink-secondary">
            Calculada con spaCy, sin LLM. La z compara con el corpus completo: 0 es el promedio de Perpetuo, ±1 una
            desviación estándar. {stylometry.longitud_tokens.toLocaleString("es")} tokens, {stylometry.num_oraciones} oraciones,{" "}
            {stylometry.num_parrafos} párrafos.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left text-ink-muted">
                  <th className="px-2 py-2 font-medium">Feature</th>
                  <th className="px-2 py-2 text-right font-medium">Valor</th>
                  <th className="px-2 py-2 text-right font-medium">z</th>
                  <th className="w-40 px-2 py-2 font-medium" aria-label="Posición frente al corpus" />
                </tr>
              </thead>
              <tbody>
                {STYLOMETRY_FEATURES.map((f) => {
                  const value = stylometry[f];
                  const z = zScore(norms, f, value);
                  return (
                    <tr key={f} className="border-b border-line/60">
                      <td className="px-2 py-2">
                        {FEATURE_LABELS[f].label}
                        <span className="block text-xs text-ink-muted">{FEATURE_LABELS[f].hint}</span>
                      </td>
                      <td className="tnum px-2 py-2 text-right">{value == null ? "—" : value.toFixed(2)}</td>
                      <td className="tnum px-2 py-2 text-right">{z == null ? "—" : signed(z)}</td>
                      <td className="px-2 py-2">
                        <ZBar z={z} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {similar.length > 0 && (
        <div>
          <h3 className="mb-2 font-display text-lg font-semibold">Textos con vocabulario parecido</h3>
          <ol className="divide-y divide-line rounded-2xl border border-line text-sm">
            {similar.map((s) => (
              <li key={s.slug} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-2.5">
                <span>
                  <Link href={`/post/${s.slug}`} className="font-medium hover:underline">
                    {s.title}
                  </Link>
                  {s.category && <span className="text-ink-muted"> · {s.category}</span>}
                  {s.sharedTerms.length > 0 && <span className="block text-xs text-ink-muted">comparten: {s.sharedTerms.join(", ")}</span>}
                </span>
                <span className="tnum text-xs text-ink-muted">{Math.round(s.similarity * 100)}% de similitud</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {isAdmin && (
        <details className="panel p-5">
          <summary className="cursor-pointer text-sm font-medium">Leer el texto completo</summary>
          <p className="mt-2 text-xs text-ink-muted">
            <a href={`/post/${encodeURIComponent(slug)}/texto`} className="underline">
              Descargar .txt
            </a>
            {" · "}actualizado el {text.updated_at.slice(0, 10)}
          </p>
          <div className="mt-4 max-h-[70vh] overflow-y-auto whitespace-pre-wrap font-serif text-[15px] leading-relaxed">{text.body}</div>
        </details>
      )}
    </section>
  );
}

function excerpt(s: string): string {
  const clean = s.replace(/\s+/g, " ").trim();
  return clean.length > 140 ? `${clean.slice(0, 140)}…` : clean;
}

function signed(v: number | null | undefined): string {
  if (v == null) return "—";
  return v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2);
}

function conf(v: number | null | undefined): string | undefined {
  return v == null ? undefined : `confianza ${Math.round(v * 100)}%`;
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="font-medium">{value}</dd>
      {hint && <dd className="text-xs text-ink-muted">{hint}</dd>}
    </div>
  );
}

function Quote({ text }: { text: string }) {
  // Sin las comillas que ya traiga la cita, para no mostrar ««…»».
  const clean = text.trim().replace(/^[«“"']+|[»”"']+$/g, "");
  return <blockquote className="mt-2 border-l-2 border-line-strong pl-3 font-serif text-sm italic text-ink-secondary">«{clean}»</blockquote>;
}

function InvalidBadge() {
  return (
    <span className="ml-2 rounded-full border border-red-700/40 px-2 py-0.5 text-xs text-red-700" title="La cita no aparece literalmente en el texto">
      evidencia inválida
    </span>
  );
}

function AxisCard({ title, dim }: { title: string; dim: Dimension | undefined }) {
  if (!dim) return null;
  const score = dim.score as number;
  const confidence = dim.confianza ?? 0;
  const evidence = (dim.evidencia as unknown as string[] | undefined) ?? [];
  return (
    <div className="panel p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium">{title}</p>
        <p className="tnum text-2xl font-semibold">
          {score}
          <span className="text-sm font-normal text-ink-muted">/100</span>
        </p>
      </div>
      <p className={`text-xs ${confidence < CONFIDENCE_FLOOR ? "text-red-700" : "text-ink-muted"}`}>
        confianza {Math.round(confidence * 100)}%{dim.evidencia_invalida && <InvalidBadge />}
      </p>
      {typeof dim.justificacion === "string" && <p className="mt-2 text-sm text-ink-secondary">{dim.justificacion}</p>}
      {evidence.map((q) => (
        <Quote key={q} text={q} />
      ))}
    </div>
  );
}

function formatField(value: unknown): string {
  if (value == null) return "—";
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "—";
  return String(value);
}

function DimensionCard({
  title,
  theory,
  dim,
  fields,
  children,
}: {
  title: string;
  theory?: string;
  dim: Dimension | undefined;
  fields: [string, string][];
  children?: React.ReactNode;
}) {
  if (!dim) return null;
  return (
    <div className="panel p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-medium">
          {title}
          {theory && <span className="ml-2 text-xs font-normal text-ink-muted">{theory}</span>}
        </p>
        {dim.confianza != null && <span className="text-xs text-ink-muted">confianza {Math.round(dim.confianza * 100)}%</span>}
      </div>
      {fields.length > 0 && (
        <dl className="mt-2 space-y-1 text-sm">
          {fields.map(([label, key]) => (
            <div key={key} className="flex gap-2">
              <dt className="w-32 shrink-0 text-ink-muted">{label}</dt>
              <dd>{formatField(dim[key])}</dd>
            </div>
          ))}
        </dl>
      )}
      {children}
      {typeof dim.evidencia === "string" && dim.evidencia && <Quote text={dim.evidencia} />}
      {dim.evidencia_invalida && <InvalidBadge />}
    </div>
  );
}

function ImagesList({ dim }: { dim: Dimension | undefined }) {
  const images = (dim?.imagenes_recurrentes as { imagen: string; evidencia: string; evidencia_invalida?: boolean }[] | undefined) ?? [];
  if (images.length === 0) return null;
  return (
    <div className="mt-2 text-sm">
      <p className="text-ink-muted">Imágenes recurrentes</p>
      <ul className="mt-1 list-disc pl-5">
        {images.map((img) => (
          <li key={img.imagen}>
            {img.imagen}
            {img.evidencia_invalida && <InvalidBadge />}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Barra divergente desde el centro (promedio del corpus), recortada a ±3.
function ZBar({ z }: { z: number | null }) {
  if (z == null) return null;
  const clipped = Math.max(-3, Math.min(3, z));
  const width = (Math.abs(clipped) / 3) * 50;
  return (
    <span className="relative block h-2 rounded-full bg-surface-sunk" aria-hidden>
      <span className="absolute left-1/2 top-[-3px] h-[14px] w-px bg-line-strong" />
      <span
        className="absolute top-0 h-2 rounded-full bg-blue"
        style={clipped >= 0 ? { left: "50%", width: `${width}%` } : { right: "50%", width: `${width}%` }}
      />
    </span>
  );
}
