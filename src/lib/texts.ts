// Textos completos de los posts (tabla post_texts) y su similitud léxica.
// Los usan la API de ingesta (app/api/ingest/texts), la ficha de cada post,
// /textos y /textos/comparar. El análisis literario (compass, afecto,
// dimensiones) lo escribe el worker de analysis/ y se lee en lib/compass.ts.
// Solo servidor.

import { createHash } from "node:crypto";
import { query, queryOne } from "./db";
import type { Post, PostText } from "./db-types";
import { deriveSlug, slugify } from "./format";
import { similarity } from "./dedupe";
import { DUPLICATE_SIMILARITY_THRESHOLD } from "./imports/posts";
import { matchPostType } from "./post-types";
import type { Category } from "./categories";
import {
  buildCorpus,
  countWords,
  nearestNeighbors,
  normalizeText,
  predictCategory,
  termCounts,
  vectorize,
  weightedEstimate,
  type Corpus,
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

// ─────────────────────────────────────────────
// Leer
// ─────────────────────────────────────────────

export function getPostText(postId: string): Promise<PostText | null> {
  return queryOne<PostText>("select * from post_texts where post_id = $1", [postId]);
}

export type TextStatus = {
  slug: string;
  title: string;
  url: string | null;
  published_at: string | null;
  post_type: string | null;
  tiene_texto: boolean;
  // Si el worker ya hizo el análisis literario de la versión actual del texto.
  analizado: boolean;
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
            coalesce(l.content_hash = t.content_hash, false) as analizado,
            t.word_count as palabras, t.content_hash as hash, t.updated_at as texto_actualizado
     from posts p
     left join post_texts t on t.post_id = p.id
     left join post_literary l on l.post_id = p.id
     order by p.published_at desc nulls last, p.title`
  );
}

// Un texto del corpus: identidad del post, huella léxica y, si ya pasó por
// el worker, su lugar en el compass. Sin el cuerpo del texto, que no hace
// falta para comparar y pesa mucho.
export type CorpusRow = {
  post_id: string;
  slug: string;
  title: string;
  published_at: string | null;
  post_type: string | null;
  extra_post_types: string[];
  word_count: number;
  term_counts: Record<string, number>;
  compass_x: number | null;
  compass_y: number | null;
};

export function getTextCorpus(): Promise<CorpusRow[]> {
  return query<CorpusRow>(
    `select p.id as post_id, p.slug, p.title, p.published_at, p.post_type, p.extra_post_types,
            t.word_count, t.term_counts, l.compass_x, l.compass_y
     from post_texts t
     join posts p on p.id = t.post_id
     left join post_literary l on l.post_id = t.post_id
     order by p.published_at desc nulls last`
  );
}

export type CorpusModel = {
  rows: CorpusRow[];
  byId: Map<string, CorpusRow>;
  // Sección principal de cada texto, ya resuelta a la categoría canónica
  // (post_type trae alias históricos, ver lib/post-types.ts).
  categoryById: Map<string, Category | null>;
  corpus: Corpus;
};

export function buildCorpusModel(rows: CorpusRow[], categories: Category[]): CorpusModel {
  return {
    rows,
    byId: new Map(rows.map((r) => [r.post_id, r])),
    categoryById: new Map(rows.map((r) => [r.post_id, matchPostType(r.post_type, categories)])),
    corpus: buildCorpus(rows.map((r) => ({ id: r.post_id, terms: r.term_counts }))),
  };
}

export type SimilarText = {
  slug: string;
  title: string;
  category: string | null;
  similarity: number;
  sharedTerms: string[];
  compass_x: number | null;
  compass_y: number | null;
};

function toSimilar(model: CorpusModel, n: { id: string; similarity: number; sharedTerms: string[] }): SimilarText {
  const row = model.byId.get(n.id)!;
  return {
    slug: row.slug,
    title: row.title,
    category: model.categoryById.get(n.id)?.name ?? row.post_type,
    similarity: n.similarity,
    sharedTerms: n.sharedTerms,
    compass_x: row.compass_x,
    compass_y: row.compass_y,
  };
}

// Los textos del corpus más parecidos a uno que ya está en él.
export function similarToPost(model: CorpusModel, postId: string, k = 5): SimilarText[] {
  const index = model.corpus.ids.indexOf(postId);
  if (index < 0) return [];
  return nearestNeighbors(model.corpus, model.corpus.vectors[index], k, postId).map((n) => toSimilar(model, n));
}

// Cuántos vecinos se promedian para estimar la posición de un borrador.
const ESTIMATE_NEIGHBORS = 7;

export type DraftComparison = {
  wordCount: number;
  // Palabras del borrador que más lo distinguen del corpus.
  keyTerms: string[];
  neighbors: SimilarText[];
  // Posición estimada en el compass: promedio de la de sus vecinos léxicos.
  // Es una aproximación instantánea; el análisis real lo hace el worker
  // (`python -m perpetuo_analysis borrador`).
  estimatedCompass: { x: number; y: number } | null;
  // Cuántos de los vecinos usados ya tenían compass.
  estimatedFrom: number;
  // Similitud media con los vecinos: qué tan "conocido" es el terreno.
  confidence: number;
  categories: { category: string; share: number }[];
};

export function compareDraft(model: CorpusModel, raw: string): DraftComparison {
  const body = normalizeText(raw);
  const vector = vectorize(model.corpus, termCounts(body));
  const neighbors = nearestNeighbors(model.corpus, vector, 10).map((n) => toSimilar(model, n));
  const forEstimate = neighbors.slice(0, ESTIMATE_NEIGHBORS);
  const x = weightedEstimate(forEstimate.map((n) => ({ similarity: n.similarity, value: n.compass_x })));
  const y = weightedEstimate(forEstimate.map((n) => ({ similarity: n.similarity, value: n.compass_y })));

  return {
    wordCount: countWords(body),
    keyTerms: [...vector.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([term]) => term),
    neighbors,
    estimatedCompass: x != null && y != null ? { x, y } : null,
    estimatedFrom: forEstimate.filter((n) => n.compass_x != null).length,
    confidence: forEstimate.length > 0 ? forEstimate.reduce((acc, n) => acc + n.similarity, 0) / forEstimate.length : 0,
    categories: predictCategory(forEstimate.map((n) => ({ similarity: n.similarity, category: n.category }))),
  };
}
