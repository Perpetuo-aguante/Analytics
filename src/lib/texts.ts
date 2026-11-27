// Textos completos de los posts y su lectura de estilo/sentimiento (tablas
// post_texts y post_text_analyses). Los usan la API de ingesta
// (app/api/ingest/texts), la ficha de cada post, /textos y /textos/comparar.
// Solo servidor.

import { createHash } from "node:crypto";
import { query, queryOne } from "./db";
import type { Post, PostText, PostTextAnalysis } from "./db-types";
import { deriveSlug, slugify } from "./format";
import { similarity } from "./dedupe";
import { DUPLICATE_SIMILARITY_THRESHOLD } from "./imports/posts";
import { matchPostType } from "./post-types";
import type { Category } from "./categories";
import {
  buildCorpus,
  buildLexicalMap,
  countWords,
  nearestNeighbors,
  normalizeText,
  predictCategory,
  predictReading,
  projectOntoMap,
  READING_KEYS,
  termCounts,
  vectorize,
  type Corpus,
  type LexicalMap,
  type Reading,
} from "./text-analysis";

// Tope de tamaño de un texto: muy por encima de cualquier post real (una
// crónica larga ronda los 60.000 caracteres), pero corta a tiempo un archivo
// equivocado (un export entero, un PDF pasado a texto con basura).
export const MAX_TEXT_CHARS = 400_000;

// ─────────────────────────────────────────────
// Encontrar el post al que pertenece un texto
// ─────────────────────────────────────────────

export type PostRef = { slug?: string | null; url?: string | null; title?: string | null };

type PostIdentity = Pick<Post, "id" | "slug" | "title" | "url" | "published_at">;

export type ResolvedPost =
  | { post: PostIdentity; matchedBy: "slug" | "url" | "title" | "similar-title" }
  | { post: null; suggestions: { slug: string; title: string }[] };

const IDENTITY_COLUMNS = "id, slug, title, url, published_at";

// El agente puede identificar el post por slug, por URL de Substack o por
// título. El slug de la base sale del título del export de Substack, que no
// siempre coincide con el slug de la URL, así que se prueba en este orden:
// slug exacto → URL exacta → slug de la URL → título → título parecido (el
// mismo umbral que usa la carga de métricas para reconocer un post).
export async function resolvePost(ref: PostRef): Promise<ResolvedPost> {
  const slug = ref.slug?.trim();
  const url = ref.url?.trim();
  const title = ref.title?.trim();

  if (slug) {
    const post = await queryOne<PostIdentity>(`select ${IDENTITY_COLUMNS} from posts where slug = $1`, [slug]);
    if (post) return { post, matchedBy: "slug" };
  }
  if (url) {
    const post =
      (await queryOne<PostIdentity>(`select ${IDENTITY_COLUMNS} from posts where url = $1`, [url])) ??
      (await queryOne<PostIdentity>(`select ${IDENTITY_COLUMNS} from posts where slug = $1`, [deriveSlug(url, "")]));
    if (post) return { post, matchedBy: "url" };
  }
  if (title) {
    const post = await queryOne<PostIdentity>(
      `select ${IDENTITY_COLUMNS} from posts where slug = $1 or lower(title) = lower($2) limit 1`,
      [slugify(title), title]
    );
    if (post) return { post, matchedBy: "title" };
  }

  // Último intento: el título (o el slug de la URL) más parecido.
  const candidates = [title && slugify(title), url && deriveSlug(url, ""), slug && slugify(slug)].filter(
    (c): c is string => Boolean(c)
  );
  if (candidates.length === 0) return { post: null, suggestions: [] };
  const all = await query<PostIdentity>(`select ${IDENTITY_COLUMNS} from posts`);
  const scored = all
    .map((post) => ({ post, sim: Math.max(...candidates.map((c) => similarity(c, post.slug))) }))
    .sort((a, b) => b.sim - a.sim);
  const best = scored[0];
  if (best && best.sim >= DUPLICATE_SIMILARITY_THRESHOLD) return { post: best.post, matchedBy: "similar-title" };
  return {
    post: null,
    suggestions: scored.slice(0, 3).map(({ post }) => ({ slug: post.slug, title: post.title })),
  };
}

// ─────────────────────────────────────────────
// Guardar
// ─────────────────────────────────────────────

export type SaveTextResult = { status: "creado" | "actualizado" | "sin cambios"; wordCount: number };

export function prepareText(raw: string): { body: string; wordCount: number; hash: string } {
  const body = normalizeText(raw);
  if (!body) throw new Error("El texto está vacío.");
  if (body.length > MAX_TEXT_CHARS) {
    throw new Error(`El texto tiene ${body.length.toLocaleString("es")} caracteres; el máximo es ${MAX_TEXT_CHARS.toLocaleString("es")}.`);
  }
  return { body, wordCount: countWords(body), hash: createHash("sha256").update(body).digest("hex") };
}

export async function savePostText(
  postId: string,
  raw: string,
  meta: { fileName?: string | null; source?: string | null } = {}
): Promise<SaveTextResult> {
  const { body, wordCount, hash } = prepareText(raw);
  const existing = await queryOne<{ content_hash: string }>("select content_hash from post_texts where post_id = $1", [postId]);
  if (existing?.content_hash === hash) return { status: "sin cambios", wordCount };

  await query(
    `insert into post_texts (post_id, body, word_count, char_count, content_hash, term_counts, file_name, source)
     values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
     on conflict (post_id) do update set
       body = excluded.body, word_count = excluded.word_count, char_count = excluded.char_count,
       content_hash = excluded.content_hash, term_counts = excluded.term_counts,
       file_name = excluded.file_name, source = excluded.source, updated_at = now()`,
    [
      postId,
      body,
      wordCount,
      body.length,
      hash,
      JSON.stringify(termCounts(body)),
      meta.fileName?.slice(0, 200) ?? null,
      meta.source?.slice(0, 200) ?? null,
    ]
  );
  return { status: existing ? "actualizado" : "creado", wordCount };
}

export type AnalysisInput = {
  sentimiento: number | null;
  ensayistico: number | null;
  personal: number | null;
  politico: number | null;
  intimo: number | null;
  tono: string | null;
  resumen: string | null;
  temas: string[];
  modelo: string | null;
};

// Valida la lectura que manda el agente. Los ejes son opcionales uno por uno
// (puede mandar solo algunos), pero si vienen, tienen que estar en escala.
// Lanza Error con un mensaje que el agente pueda entender y corregir.
export function parseAnalysis(input: unknown): AnalysisInput {
  if (input == null || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("`analisis` debe ser un objeto, ej. {\"sentimiento\": -0.2, \"personal\": 0.8}.");
  }
  const raw = input as Record<string, unknown>;
  const known = new Set<string>([...READING_KEYS, "tono", "resumen", "temas", "modelo"]);
  const unknown = Object.keys(raw).filter((k) => !known.has(k));
  if (unknown.length > 0) {
    throw new Error(`Campos desconocidos en \`analisis\`: ${unknown.join(", ")}. Válidos: ${[...known].join(", ")}.`);
  }

  const num = (key: string, min: number, max: number): number | null => {
    const value = raw[key];
    if (value == null || value === "") return null;
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n) || n < min || n > max) {
      throw new Error(`\`analisis.${key}\` debe ser un número entre ${min} y ${max} (llegó ${JSON.stringify(value)}).`);
    }
    return Math.round(n * 1000) / 1000;
  };
  const str = (key: string, max: number): string | null => {
    const value = raw[key];
    if (value == null) return null;
    if (typeof value !== "string") throw new Error(`\`analisis.${key}\` debe ser texto.`);
    return value.trim().slice(0, max) || null;
  };

  let temas: string[] = [];
  if (raw.temas != null) {
    if (!Array.isArray(raw.temas) || raw.temas.some((t) => typeof t !== "string")) {
      throw new Error("`analisis.temas` debe ser una lista de textos, ej. [\"duelo\", \"ciudad\"].");
    }
    temas = Array.from(new Set((raw.temas as string[]).map((t) => t.trim().toLowerCase()).filter(Boolean))).slice(0, 12);
  }

  const result: AnalysisInput = {
    sentimiento: num("sentimiento", -1, 1),
    ensayistico: num("ensayistico", 0, 1),
    personal: num("personal", 0, 1),
    politico: num("politico", 0, 1),
    intimo: num("intimo", 0, 1),
    tono: str("tono", 60),
    resumen: str("resumen", 600),
    temas,
    modelo: str("modelo", 80),
  };
  if (READING_KEYS.every((k) => result[k] == null)) {
    throw new Error(`\`analisis\` no trae ningún eje: hace falta al menos uno de ${READING_KEYS.join(", ")}.`);
  }
  return result;
}

// La lectura es de un texto: si llega sola (sin `texto` en la misma carga),
// el post ya tiene que tener su texto guardado.
export async function saveAnalysisOrThrow(
  postId: string,
  analysis: AnalysisInput,
  opts: { requireText: boolean }
): Promise<void> {
  if (opts.requireText) {
    const existing = await queryOne("select 1 from post_texts where post_id = $1", [postId]);
    if (!existing) throw new Error("Este post todavía no tiene texto: manda `texto` junto con `analisis`.");
  }
  await savePostAnalysis(postId, analysis);
}

export async function savePostAnalysis(postId: string, analysis: AnalysisInput): Promise<void> {
  await query(
    `insert into post_text_analyses
       (post_id, sentimiento, ensayistico, personal, politico, intimo, tono, resumen, temas, modelo)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     on conflict (post_id) do update set
       sentimiento = excluded.sentimiento, ensayistico = excluded.ensayistico, personal = excluded.personal,
       politico = excluded.politico, intimo = excluded.intimo, tono = excluded.tono, resumen = excluded.resumen,
       temas = excluded.temas, modelo = excluded.modelo, analyzed_at = now()`,
    [
      postId,
      analysis.sentimiento,
      analysis.ensayistico,
      analysis.personal,
      analysis.politico,
      analysis.intimo,
      analysis.tono,
      analysis.resumen,
      analysis.temas,
      analysis.modelo,
    ]
  );
}

// ─────────────────────────────────────────────
// Leer
// ─────────────────────────────────────────────

export function getPostText(postId: string): Promise<PostText | null> {
  return queryOne<PostText>("select * from post_texts where post_id = $1", [postId]);
}

export function getPostAnalysis(postId: string): Promise<PostTextAnalysis | null> {
  return queryOne<PostTextAnalysis>("select * from post_text_analyses where post_id = $1", [postId]);
}

export function analysisToReading(a: Pick<PostTextAnalysis, (typeof READING_KEYS)[number]> | null): Reading | null {
  if (!a) return null;
  return Object.fromEntries(READING_KEYS.map((k) => [k, a[k]])) as Reading;
}

export type TextStatus = {
  slug: string;
  title: string;
  url: string | null;
  published_at: string | null;
  post_type: string | null;
  tiene_texto: boolean;
  tiene_analisis: boolean;
  palabras: number | null;
  hash: string | null;
  texto_actualizado: string | null;
};

// Estado de carga de texto de cada post, del más reciente al más viejo. Lo
// consulta el agente para saber qué le falta subir.
export function listTextStatus(): Promise<TextStatus[]> {
  return query<TextStatus>(
    `select p.slug, p.title, p.url, p.published_at, p.post_type,
            t.post_id is not null as tiene_texto,
            a.post_id is not null as tiene_analisis,
            t.word_count as palabras, t.content_hash as hash, t.updated_at as texto_actualizado
     from posts p
     left join post_texts t on t.post_id = p.id
     left join post_text_analyses a on a.post_id = p.id
     order by p.published_at desc nulls last, p.title`
  );
}

// Un texto del corpus: identidad del post, huella léxica y lectura. Sin el
// cuerpo del texto, que no hace falta para comparar y pesa mucho.
export type CorpusRow = {
  post_id: string;
  slug: string;
  title: string;
  published_at: string | null;
  post_type: string | null;
  extra_post_types: string[];
  word_count: number;
  term_counts: Record<string, number>;
  reading: Reading | null;
  tono: string | null;
};

type CorpusQueryRow = Omit<CorpusRow, "reading"> &
  Pick<PostTextAnalysis, (typeof READING_KEYS)[number]> & { has_analysis: boolean };

export async function getTextCorpus(): Promise<CorpusRow[]> {
  const rows = await query<CorpusQueryRow>(
    `select p.id as post_id, p.slug, p.title, p.published_at, p.post_type, p.extra_post_types,
            t.word_count, t.term_counts,
            a.post_id is not null as has_analysis,
            a.sentimiento, a.ensayistico, a.personal, a.politico, a.intimo, a.tono
     from post_texts t
     join posts p on p.id = t.post_id
     left join post_text_analyses a on a.post_id = t.post_id
     order by p.published_at desc nulls last`
  );
  return rows.map((r) => ({
    post_id: r.post_id,
    slug: r.slug,
    title: r.title,
    published_at: r.published_at,
    post_type: r.post_type,
    extra_post_types: r.extra_post_types,
    word_count: r.word_count,
    term_counts: r.term_counts,
    reading: r.has_analysis ? analysisToReading(r) : null,
    tono: r.tono,
  }));
}

export type CorpusModel = {
  rows: CorpusRow[];
  byId: Map<string, CorpusRow>;
  // Sección principal de cada texto, ya resuelta a la categoría canónica
  // (post_type trae alias históricos, ver lib/post-types.ts).
  categoryById: Map<string, Category | null>;
  corpus: Corpus;
  map: LexicalMap | null;
};

export function buildCorpusModel(rows: CorpusRow[], categories: Category[], withMap = true): CorpusModel {
  const corpus = buildCorpus(rows.map((r) => ({ id: r.post_id, terms: r.term_counts })));
  return {
    rows,
    byId: new Map(rows.map((r) => [r.post_id, r])),
    categoryById: new Map(rows.map((r) => [r.post_id, matchPostType(r.post_type, categories)])),
    corpus,
    map: withMap ? buildLexicalMap(corpus) : null,
  };
}

export type SimilarText = {
  slug: string;
  title: string;
  category: string | null;
  similarity: number;
  sharedTerms: string[];
};

// Los textos del corpus más parecidos a uno que ya está en él.
export function similarToPost(model: CorpusModel, postId: string, k = 5): SimilarText[] {
  const index = model.corpus.ids.indexOf(postId);
  if (index < 0) return [];
  return nearestNeighbors(model.corpus, model.corpus.vectors[index], k, postId).map((n) => {
    const row = model.byId.get(n.id)!;
    return {
      slug: row.slug,
      title: row.title,
      category: model.categoryById.get(n.id)?.name ?? row.post_type,
      similarity: n.similarity,
      sharedTerms: n.sharedTerms,
    };
  });
}

// Cuántos vecinos se promedian para estimar la lectura de un texto nuevo.
const PREDICTION_NEIGHBORS = 7;

export type DraftComparison = {
  wordCount: number;
  // Palabras del borrador que más lo distinguen del corpus.
  keyTerms: string[];
  neighbors: SimilarText[];
  predicted: Reading;
  // Cuántos de los vecinos usados tenían lectura (si es 0, no hay predicción).
  predictedFrom: number;
  // Similitud media con los vecinos: qué tan "conocido" es el terreno.
  confidence: number;
  categories: { category: string; share: number }[];
  mapPoint: [number, number] | null;
};

// Compara un texto nuevo (que no está en la base) con todo el corpus: a qué
// textos se parece, dónde caería en el mapa léxico y qué lectura de estilo y
// sentimiento tendría, estimada a partir de sus vecinos.
export function compareDraft(model: CorpusModel, raw: string): DraftComparison {
  const body = normalizeText(raw);
  const terms = termCounts(body);
  const vector = vectorize(model.corpus, terms);
  const neighbors = nearestNeighbors(model.corpus, vector, Math.max(PREDICTION_NEIGHBORS, 10));
  const withRows = neighbors.map((n) => ({
    ...n,
    row: model.byId.get(n.id)!,
    category: model.categoryById.get(n.id)?.name ?? model.byId.get(n.id)!.post_type,
  }));
  const forPrediction = withRows.slice(0, PREDICTION_NEIGHBORS);

  const keyTerms = [...vector.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([term]) => term);

  return {
    wordCount: countWords(body),
    keyTerms,
    neighbors: withRows.map((n) => ({
      slug: n.row.slug,
      title: n.row.title,
      category: n.category,
      similarity: n.similarity,
      sharedTerms: n.sharedTerms,
    })),
    predicted: predictReading(forPrediction.map((n) => ({ similarity: n.similarity, reading: n.row.reading }))),
    predictedFrom: forPrediction.filter((n) => n.row.reading).length,
    confidence:
      forPrediction.length > 0 ? forPrediction.reduce((acc, n) => acc + n.similarity, 0) / forPrediction.length : 0,
    categories: predictCategory(forPrediction.map((n) => ({ similarity: n.similarity, category: n.category }))),
    mapPoint: model.map ? projectOntoMap(model.map, model.corpus, vector) : null,
  };
}
