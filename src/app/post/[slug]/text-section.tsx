import Link from "next/link";
import { ReadingBars } from "@/components/reading-bars";
import { getCategories } from "@/lib/categories";
import { analysisToReading, buildCorpusModel, getPostAnalysis, getPostText, getTextCorpus, similarToPost } from "@/lib/texts";
import { readingMinutes } from "@/lib/text-analysis";

// El texto completo del post (si ya se cargó), su lectura de estilo y
// sentimiento, y los textos de Perpetuo que más se le parecen. El texto
// entero solo lo ven los admins: puede ser contenido de pago en Substack.
export async function TextSection({ postId, slug, isAdmin }: { postId: string; slug: string; isAdmin: boolean }) {
  const [text, analysis] = await Promise.all([getPostText(postId), getPostAnalysis(postId)]);

  if (!text) {
    return (
      <section className="mt-12">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-ink-muted">Texto</h2>
        <p className="text-sm text-ink-muted">
          Todavía no hay texto cargado para este post. Lo sube el agente por la API de ingesta
          (<code>POST /api/ingest/texts</code>).
        </p>
      </section>
    );
  }

  const [rows, categories] = await Promise.all([getTextCorpus(), getCategories()]);
  const similar = similarToPost(buildCorpusModel(rows, categories, false), postId, 5);
  const reading = analysisToReading(analysis);

  return (
    <section className="mt-12 space-y-8">
      <div>
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-ink-muted">Texto</h2>
        <p className="text-sm text-ink-secondary">
          {text.word_count.toLocaleString("es")} palabras · {readingMinutes(text.word_count)} min de lectura
          {analysis?.tono && <> · tono {analysis.tono}</>}
        </p>
      </div>

      {analysis && reading ? (
        <div className="panel p-5">
          <ReadingBars reading={reading} />
          {analysis.resumen && <p className="mt-4 text-sm text-ink-secondary">{analysis.resumen}</p>}
          {analysis.temas.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-1.5 text-xs">
              {analysis.temas.map((tema) => (
                <li key={tema} className="rounded-full border border-line px-2.5 py-0.5 text-ink-secondary">
                  {tema}
                </li>
              ))}
            </ul>
          )}
          {analysis.modelo && <p className="mt-3 text-xs text-ink-muted">Lectura hecha por {analysis.modelo}.</p>}
        </div>
      ) : (
        <p className="text-sm text-ink-muted">El texto todavía no tiene lectura de estilo y sentimiento.</p>
      )}

      {similar.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-muted">Textos más parecidos</h3>
          <ol className="divide-y divide-line rounded-2xl border border-line text-sm">
            {similar.map((s) => (
              <li key={s.slug} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-2.5">
                <span>
                  <Link href={`/post/${s.slug}`} className="font-medium hover:underline">
                    {s.title}
                  </Link>
                  {s.category && <span className="text-ink-muted"> · {s.category}</span>}
                  {s.sharedTerms.length > 0 && (
                    <span className="block text-xs text-ink-muted">comparten: {s.sharedTerms.join(", ")}</span>
                  )}
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
          <div className="mt-4 max-h-[70vh] overflow-y-auto whitespace-pre-wrap font-serif text-[15px] leading-relaxed">
            {text.body}
          </div>
        </details>
      )}
    </section>
  );
}
