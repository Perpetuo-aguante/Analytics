import Link from "next/link";
import { TextMap, type TextMapDatum } from "@/components/text-map";
import { getCategories } from "@/lib/categories";
import { anchorAlerts, CONFIDENCE_FLOOR, getCompassCorpus, getPostCompass, zScore, type Dimension } from "@/lib/compass";
import { PROMPT_VERSION } from "@/lib/compass-vocab";
import { matchPostType } from "@/lib/post-types";
import { readingMinutes } from "@/lib/text-analysis";
import { FEATURE_KEYS, FEATURE_LABELS } from "@/lib/text-features";
import { buildCorpusModel, getPostText, getTextCorpus, similarToPost } from "@/lib/texts";

// El texto del post y su lectura del compass: los dos ejes, tesis,
// figuración, intertextualidad, lector implícito, apertura, cierre y temas,
// más la estilometría mínima y los textos parecidos. El texto entero solo lo
// ven los admins: puede ser contenido de pago en Substack.
export async function TextSection({ postId, slug, isAdmin }: { postId: string; slug: string; isAdmin: boolean }) {
  const text = await getPostText(postId);
  if (!text) {
    return (
      <section className="mt-12">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-ink-muted">Texto y compass</h2>
        <p className="text-sm text-ink-muted">
          Todavía no hay texto cargado para este post. Lo sube el agente por <code>POST /api/ingest/texts</code>.
        </p>
      </section>
    );
  }

  const [{ compass, themes, references, norms }, corpusRows, compassRows, categories] = await Promise.all([
    getPostCompass(postId),
    getTextCorpus(),
    getCompassCorpus(),
    getCategories(),
  ]);
  const similar = similarToPost(buildCorpusModel(corpusRows, categories), postId, 5);
  const features = text.features && Object.keys(text.features).length > 0 ? text.features : null;
  const dims = compass?.dimensiones ?? {};
  const stale = compass != null && (compass.content_hash !== text.content_hash || compass.prompt_version !== PROMPT_VERSION);
  const alerts = compass ? anchorAlerts({ compass_x: compass.compass_x, compass_y: compass.compass_y, features }, norms) : [];

  const mapPoints: TextMapDatum[] = [];
  for (const row of compassRows) {
    const category = matchPostType(row.post_type, categories);
    if (!category || row.post_id === postId) continue;
    mapPoints.push({ id: row.post_id, slug: row.slug, title: row.title, category, x: row.compass_x / 100, y: row.compass_y / 100, faded: true });
  }

  return (
    <section className="mt-12 space-y-10">
      <div>
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-ink-muted">Texto y compass</h2>
        <p className="text-sm text-ink-secondary">
          {text.word_count.toLocaleString("es")} palabras · {readingMinutes(text.word_count)} min de lectura
          {compass && (
            <>
              {" "}
              · lectura de {compass.modelo ?? "el agente"} del {compass.analyzed_at.slice(0, 10)}
            </>
          )}
        </p>
        {!compass && <p className="mt-2 text-sm text-ink-muted">Todavía no tiene lectura: la manda el agente en su próxima corrida.</p>}
        {stale && <p className="mt-2 text-sm text-red-700">El texto o la guía cambiaron después de la lectura: está pendiente de una nueva.</p>}
      </div>

      {compass && (
        <div className="space-y-4">
          <h3 className="font-display text-xl font-bold">Compass editorial</h3>
          <div className="panel p-4">
            <TextMap
              data={mapPoints}
              categories={categories}
              midlines
              highlight={{ x: compass.compass_x / 100, y: compass.compass_y / 100, label: "Este post" }}
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
                <p className="mt-1 text-xs text-ink-muted">La estilometría contradice el score: conviene revisarlo a mano.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {compass && (
        <div>
          <h3 className="mb-3 font-display text-xl font-bold">Lectura literaria</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <DimensionCard title="Tesis" theory="Montaigne, Adorno" dim={dims.tesis} fields={[["Tesis", "valor"]]} />
            <DimensionCard title="Figuración" theory="Jakobson" dim={dims.figuracion} fields={[["Polo dominante", "polo"], ["Campos semánticos", "campos_semanticos"]]} />
            <DimensionCard title="Apertura" dim={dims.apertura} fields={[["Gancho", "tipo"], ["Fuerza (1-5)", "fuerza"]]} />
            <DimensionCard title="Cierre" dim={dims.cierre} fields={[["Tipo", "tipo"]]} />
            <DimensionCard
              title="Lector implícito"
              theory="Iser, Eco"
              dim={dims.lector_implicito}
              fields={[["Dificultad (1-5)", "dificultad"], ["Competencias", "competencias"], ["Lector modelo", "lector_modelo"]]}
            />
            <div className="panel p-4">
              <p className="font-medium">Temas</p>
              <ul className="mt-2 space-y-1 text-sm">
                {themes.map((t) => (
                  <li key={t.tema} className="flex items-center gap-3">
                    <span className="w-40 shrink-0">{t.nombre}</span>
                    <span className="h-2 flex-1 rounded-full bg-surface-sunk" aria-hidden>
                      <span className="block h-2 rounded-full bg-blue" style={{ width: `${t.peso * 100}%` }} />
                    </span>
                    <span className="tnum w-10 text-right text-xs">{Math.round(t.peso * 100)}%</span>
                  </li>
                ))}
              </ul>
            </div>
            <DimensionCard title="Intertextualidad" theory="Genette, Kristeva" dim={dims.intertextualidad} fields={[]} wide>
              {references.length === 0 ? (
                <p className="mt-2 text-sm text-ink-muted">Sin referencias explícitas.</p>
              ) : (
                <ul className="mt-2 space-y-2 text-sm">
                  {references.map((r, i) => (
                    <li key={i}>
                      <span className="font-medium">{r.autor}</span>
                      {r.obra && <em>, {r.obra}</em>}
                      <span className="text-ink-muted"> · {r.tipo} · tradición {r.tradicion}</span>
                      {r.evidencia_invalida && <InvalidBadge />}
                      {r.evidencia && <Quote text={r.evidencia} />}
                    </li>
                  ))}
                </ul>
              )}
            </DimensionCard>
          </div>
        </div>
      )}

      {features && (
        <div>
          <h3 className="mb-1 font-display text-xl font-bold">Estilometría</h3>
          <p className="mb-3 text-sm text-ink-secondary">
            Rasgos calculados sin LLM, para anclar el compass. La z compara con todos los textos cargados: 0 es el
            promedio de Perpetuo, ±1 una desviación estándar.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left text-ink-muted">
                  <th className="px-2 py-2 font-medium">Rasgo</th>
                  <th className="px-2 py-2 text-right font-medium">Valor</th>
                  <th className="px-2 py-2 text-right font-medium">z</th>
                  <th className="w-40 px-2 py-2 font-medium" aria-label="Posición frente al corpus" />
                </tr>
              </thead>
              <tbody>
                {FEATURE_KEYS.map((f) => {
                  const value = features[f] ?? null;
                  const z = zScore(norms, f, value);
                  return (
                    <tr key={f} className="border-b border-line/60">
                      <td className="px-2 py-2">
                        {FEATURE_LABELS[f].label}
                        <span className="block text-xs text-ink-muted">{FEATURE_LABELS[f].hint}</span>
                      </td>
                      <td className="tnum px-2 py-2 text-right">{value == null ? "—" : value.toFixed(2)}</td>
                      <td className="tnum px-2 py-2 text-right">{z == null ? "—" : z > 0 ? `+${z.toFixed(2)}` : z.toFixed(2)}</td>
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
          <h3 className="mb-2 font-display text-xl font-bold">Textos con vocabulario parecido</h3>
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
  const confidence = dim.confianza ?? 0;
  const evidence = Array.isArray(dim.evidencia) ? (dim.evidencia as string[]) : [];
  return (
    <div className="panel p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium">{title}</p>
        <p className="tnum text-2xl font-semibold">
          {String(dim.score)}
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
  wide,
  children,
}: {
  title: string;
  theory?: string;
  dim: Dimension | undefined;
  fields: [string, string][];
  wide?: boolean;
  children?: React.ReactNode;
}) {
  if (!dim) return null;
  return (
    <div className={`panel p-4 ${wide ? "md:col-span-2" : ""}`}>
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
              <dt className="w-36 shrink-0 text-ink-muted">{label}</dt>
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
