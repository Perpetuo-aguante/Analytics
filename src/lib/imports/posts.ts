// Importación de métricas de posts: la usan tanto la carga manual de /subir
// (app/subir/actions.ts) como la API de ingesta automática
// (app/api/ingest/posts/route.ts), para que las dos guarden exactamente igual.
// Las funciones lanzan Error con un mensaje legible si algo falla.

import { revalidatePath } from "next/cache";
import { findSignupsAndSubscribesHeaders, suggestMapping, type FieldKey } from "@/lib/columns";
import { cellToString, parseDateValue, parseIntValue, parseMoneyValue, parseRateValue, slugify } from "@/lib/format";
import { similarity } from "@/lib/dedupe";
import { inferPostTypeFromDate } from "@/lib/post-types";
import { query, upsertRows } from "@/lib/db";
import type { ParsedSheet } from "@/lib/parse";

// Umbral de similitud (0-1) para considerar dos posts "el mismo post" al
// resolver el slug de identidad (ver resolveExistingSlug) y al buscar
// duplicados ya cargados (ver findDuplicateCandidates en app/subir/actions.ts). 0.82
// detecta variantes como slug-crudo-vs-título-real sin generar demasiados
// falsos positivos entre títulos legítimamente distintos.
export const DUPLICATE_SIMILARITY_THRESHOLD = 0.82;
// Cuando el título de alguno de los dos posts es en realidad un slug crudo
// (ver dedupe.ts:looksLikeSlug) comparamos más generosamente: ese es
// exactamente el caso que motivó este detector, y un slug crudo puede
// diferir del título real más de lo que difieren dos títulos reales entre
// sí (trunca palabras, no lleva tildes/mayúsculas).
export const SLUG_TITLE_SIMILARITY_THRESHOLD = 0.6;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export type PostMapping = Record<FieldKey, string | null>;

export type PreparedPostSheet = {
  headers: string[];
  suggestedMapping: PostMapping;
  rows: Record<string, unknown>[];
  rowCount: number;
};

export type ImportSummary = {
  postsCreados: number;
  postsActualizados: number;
  snapshots: number;
};

// Valida el archivo y sugiere el mapeo de columnas (español/inglés).
export function preparePostSheet(sheet: ParsedSheet): PreparedPostSheet {
  const { headers, rows } = sheet;
  if (headers.length === 0) throw new Error("No se detectaron columnas en el archivo.");
  if (rows.length === 0) throw new Error("El archivo no tiene filas de datos.");

  // Si el archivo trae signups y subscribes/subscribers como columnas
  // separadas (lo normal en el export de posts de Substack), no hacemos
  // elegir una: se suman en una columna sintética y esa es la que se
  // sugiere para "Nuevos suscriptores", para no volver a preguntar.
  const { signups, subscribes } = findSignupsAndSubscribesHeaders(headers);
  let effectiveHeaders = headers;
  let effectiveRows = rows;
  if (signups && subscribes) {
    const combinedHeader = `Nuevos suscriptores (${signups} + ${subscribes}, sumado automáticamente)`;
    effectiveHeaders = [...headers, combinedHeader];
    effectiveRows = rows.map((row) => ({
      ...row,
      [combinedHeader]: (parseIntValue(row[signups]) ?? 0) + (parseIntValue(row[subscribes]) ?? 0),
    }));
  }

  const suggestedMapping = suggestMapping(effectiveHeaders);
  if (signups && subscribes) {
    suggestedMapping.new_subscribers = `Nuevos suscriptores (${signups} + ${subscribes}, sumado automáticamente)`;
  }

  return { headers: effectiveHeaders, rows: effectiveRows, rowCount: effectiveRows.length, suggestedMapping };
}

// Guarda los posts (identidad) y un snapshot de métricas por post con la
// fecha dada. Volver a importar la misma fecha actualiza ese snapshot en vez
// de duplicarlo.
export async function importPosts(input: {
  rows: Record<string, unknown>[];
  mapping: PostMapping;
  snapshotDate: string;
}): Promise<ImportSummary> {
  const { rows, mapping, snapshotDate } = input;

  if (!mapping.title) {
    throw new Error("Título es obligatorio en el mapeo.");
  }
  if (!snapshotDate) {
    throw new Error("Falta la fecha del snapshot.");
  }

  type PostRow = {
    slug: string;
    title: string;
    author?: string | null;
    post_type?: string | null;
    published_at?: string | null;
  };

  // Slugs de los posts que ya existen en la base, para poder reconocer un
  // post que ya conocíamos aunque este archivo lo traiga con el título en
  // otro formato (ej. slug crudo de Substack en cargas viejas vs. título en
  // lenguaje natural en las nuevas — ver dedupe.ts). Sin esto, un cambio de
  // formato entre cargas genera una fila nueva por post en vez de
  // actualizar la existente.
  const existingPostsForMatch = await query<{ slug: string }>("select slug from posts");
  const knownSlugs = existingPostsForMatch.map((p) => p.slug);
  const knownSlugSet = new Set(knownSlugs);
  // Slugs ya resueltos dentro de esta misma carga, para tampoco duplicar
  // internamente si el mismo post aparece más de una vez en el archivo.
  const batchSlugs: string[] = [];

  function resolveExistingSlug(candidateSlug: string): string {
    if (knownSlugSet.has(candidateSlug) || batchSlugs.includes(candidateSlug)) return candidateSlug;
    let best: { slug: string; sim: number } | null = null;
    for (const slug of [...knownSlugs, ...batchSlugs]) {
      const sim = similarity(candidateSlug, slug);
      if (sim >= DUPLICATE_SIMILARITY_THRESHOLD && (!best || sim > best.sim)) best = { slug, sim };
    }
    return best ? best.slug : candidateSlug;
  }

  const postsBySlug = new Map<string, PostRow>();
  const snapshotsBySlug = new Map<string, Record<string, unknown>>();

  for (const row of rows) {
    const title = cellToString(row[mapping.title]);
    if (!title) continue; // fila sin identidad de post: se ignora

    const slug = resolveExistingSlug(slugify(title));
    if (!batchSlugs.includes(slug)) batchSlugs.push(slug);

    // El título siempre se guarda con el valor de esta carga (la más
    // reciente "pisa" al histórico, mismo criterio que author/post_type
    // más abajo) — así un post que cambió de formato de título entre
    // cargas termina mostrando el título nuevo, no el viejo duplicado.
    const post: PostRow = { slug, title };
    if (mapping.author) post.author = cellToString(row[mapping.author]);

    const publishedAt = mapping.published_at ? parseDateValue(row[mapping.published_at]) : null;
    if (mapping.published_at) post.published_at = publishedAt;

    // Tipo de post: se usa el valor del CSV si vino; si no (cada vez más
    // frecuente en los exports recientes), se intenta inferir a partir del
    // día de la semana de published_at (ver inferPostTypeFromDate). Si
    // ninguno de los dos da un valor, se omite el campo del todo para no
    // pisar con null un post_type que el post ya tenía de una carga
    // anterior.
    const explicitPostType = mapping.post_type ? cellToString(row[mapping.post_type]) : null;
    const postType = explicitPostType ?? inferPostTypeFromDate(publishedAt);
    if (postType) post.post_type = postType;

    postsBySlug.set(slug, post);

    snapshotsBySlug.set(slug, {
      snapshot_date: snapshotDate,
      views: mapping.views ? parseIntValue(row[mapping.views]) : null,
      new_subscribers: mapping.new_subscribers ? parseIntValue(row[mapping.new_subscribers]) : null,
      open_rate: mapping.open_rate ? parseRateValue(row[mapping.open_rate]) : null,
      click_to_open_rate: mapping.click_to_open_rate
        ? parseRateValue(row[mapping.click_to_open_rate])
        : null,
      engagement: mapping.engagement ? parseRateValue(row[mapping.engagement]) : null,
      estimated_value: mapping.estimated_value ? parseMoneyValue(row[mapping.estimated_value]) : null,
    });
  }

  if (postsBySlug.size === 0) {
    throw new Error("Ninguna fila tiene título válido.");
  }

  const postsPayload = Array.from(postsBySlug.values());
  // Ya tenemos todos los slugs existentes de la consulta de arriba
  // (existingPostsForMatch) — no hace falta volver a pedirlos. Solo nos
  // interesa cuántos de los slugs de ESTA carga ya existían, para el
  // resumen de creados/actualizados.
  const existingSlugsInBatch = postsPayload.filter((p) => knownSlugSet.has(p.slug)).length;

  let upsertedPosts: { id: string; slug: string }[];
  try {
    upsertedPosts = await upsertRows<{ id: string; slug: string }>("posts", postsPayload, ["slug"], ["id", "slug"]);
  } catch (err) {
    throw new Error(`No se pudo guardar los posts: ${errorMessage(err)}`);
  }

  const idBySlug = new Map(upsertedPosts.map((p) => [p.slug, p.id]));
  const snapshotsPayload = Array.from(snapshotsBySlug.entries())
    .map(([slug, snap]) => ({ post_id: idBySlug.get(slug), ...snap }))
    .filter((s) => s.post_id);

  try {
    await upsertRows("metric_snapshots", snapshotsPayload, ["post_id", "snapshot_date"]);
  } catch (err) {
    throw new Error(`No se pudo guardar las métricas: ${errorMessage(err)}`);
  }

  revalidatePath("/");
  revalidatePath("/rankings");

  return {
    postsCreados: postsPayload.length - existingSlugsInBatch,
    postsActualizados: existingSlugsInBatch,
    snapshots: snapshotsPayload.length,
  };
}
