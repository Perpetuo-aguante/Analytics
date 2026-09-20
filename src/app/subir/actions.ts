"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  checkPassword,
  createSessionCookieValue,
  requireSession,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE,
} from "@/lib/session";
import { parseUploadedFile } from "@/lib/parse";
import { findSignupsAndSubscribesHeaders, suggestMapping, type FieldKey } from "@/lib/columns";
import { cellToString, parseDateValue, parseIntValue, parseRateValue, slugify } from "@/lib/format";
import { looksLikeSlug, similarity } from "@/lib/dedupe";
import { inferPostTypeFromDate } from "@/lib/post-types";
import { createAdminClient } from "@/lib/supabase/server";

// Umbral de similitud (0-1) para considerar dos posts "el mismo post" al
// resolver el slug de identidad (ver resolveExistingSlug) y al buscar
// duplicados ya cargados (ver findDuplicateCandidates, más abajo). 0.82
// detecta variantes como slug-crudo-vs-título-real sin generar demasiados
// falsos positivos entre títulos legítimamente distintos.
const DUPLICATE_SIMILARITY_THRESHOLD = 0.82;
// Cuando el título de alguno de los dos posts es en realidad un slug crudo
// (ver dedupe.ts:looksLikeSlug) comparamos más generosamente: ese es
// exactamente el caso que motivó este detector, y un slug crudo puede
// diferir del título real más de lo que difieren dos títulos reales entre
// sí (trunca palabras, no lleva tildes/mayúsculas).
const SLUG_TITLE_SIMILARITY_THRESHOLD = 0.6;

export type LoginState = { error: string | null };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const password = String(formData.get("password") ?? "");
  if (!checkPassword(password)) {
    return { error: "Contraseña incorrecta." };
  }
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, createSessionCookieValue(), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return { error: null };
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export type ParsePreview = {
  headers: string[];
  suggestedMapping: Record<FieldKey, string | null>;
  rows: Record<string, unknown>[];
  rowCount: number;
};

export async function parseFile(
  formData: FormData
): Promise<{ data: ParsePreview | null; error: string | null }> {
  try {
    await requireSession();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { data: null, error: "Selecciona un archivo .xlsx o .csv." };
    }
    const { headers, rows } = await parseUploadedFile(file);
    if (headers.length === 0) {
      return { data: null, error: "No se detectaron columnas en el archivo." };
    }
    if (rows.length === 0) {
      return { data: null, error: "El archivo no tiene filas de datos." };
    }

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

    return {
      data: { headers: effectiveHeaders, rows: effectiveRows, rowCount: effectiveRows.length, suggestedMapping },
      error: null,
    };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : "No se pudo leer el archivo." };
  }
}

export type ImportSummary = {
  postsCreados: number;
  postsActualizados: number;
  snapshots: number;
};

export async function commitImport(input: {
  rows: Record<string, unknown>[];
  mapping: Record<FieldKey, string | null>;
  snapshotDate: string;
}): Promise<{ data: ImportSummary | null; error: string | null }> {
  try {
    await requireSession();
    const { rows, mapping, snapshotDate } = input;

    if (!mapping.title) {
      return { data: null, error: "Título es obligatorio en el mapeo." };
    }
    if (!snapshotDate) {
      return { data: null, error: "Falta la fecha del snapshot." };
    }

    type PostRow = {
      slug: string;
      title: string;
      author?: string | null;
      post_type?: string | null;
      published_at?: string | null;
    };

    const supabase = createAdminClient();

    // Slugs de los posts que ya existen en la base, para poder reconocer un
    // post que ya conocíamos aunque este archivo lo traiga con el título en
    // otro formato (ej. slug crudo de Substack en cargas viejas vs. título en
    // lenguaje natural en las nuevas — ver dedupe.ts). Sin esto, un cambio de
    // formato entre cargas genera una fila nueva por post en vez de
    // actualizar la existente.
    const { data: existingPostsForMatch, error: existingMatchError } = await supabase
      .from("posts")
      .select("slug");
    if (existingMatchError) {
      return { data: null, error: `No se pudo leer posts existentes: ${existingMatchError.message}` };
    }
    const knownSlugs = (existingPostsForMatch ?? []).map((p) => p.slug as string);
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
      });
    }

    if (postsBySlug.size === 0) {
      return { data: null, error: "Ninguna fila tiene título válido." };
    }

    const postsPayload = Array.from(postsBySlug.values());
    // Ya tenemos todos los slugs existentes de la consulta de arriba
    // (existingPostsForMatch) — no hace falta volver a pedirlos. Solo nos
    // interesa cuántos de los slugs de ESTA carga ya existían, para el
    // resumen de creados/actualizados.
    const existingSlugsInBatch = postsPayload.filter((p) => knownSlugSet.has(p.slug)).length;

    const { data: upsertedPosts, error: upsertError } = await supabase
      .from("posts")
      .upsert(postsPayload, { onConflict: "slug" })
      .select("id, slug");
    if (upsertError || !upsertedPosts) {
      return { data: null, error: `No se pudo guardar los posts: ${upsertError?.message}` };
    }

    const idBySlug = new Map(upsertedPosts.map((p) => [p.slug as string, p.id as string]));
    const snapshotsPayload = Array.from(snapshotsBySlug.entries())
      .map(([slug, snap]) => ({ post_id: idBySlug.get(slug), ...snap }))
      .filter((s) => s.post_id);

    const { error: snapshotError } = await supabase
      .from("metric_snapshots")
      .upsert(snapshotsPayload, { onConflict: "post_id,snapshot_date" });
    if (snapshotError) {
      return { data: null, error: `No se pudo guardar las métricas: ${snapshotError.message}` };
    }

    revalidatePath("/");
    revalidatePath("/rankings");

    return {
      data: {
        postsCreados: postsPayload.length - existingSlugsInBatch,
        postsActualizados: existingSlugsInBatch,
        snapshots: snapshotsPayload.length,
      },
      error: null,
    };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : "No se pudo importar el archivo." };
  }
}

export type UploadBatch = {
  snapshotDate: string;
  postCount: number;
};

// Una "carga" es todo lo que se subió con la misma fecha de snapshot: no
// guardamos un id de carga aparte, así que agrupamos metric_snapshots por
// snapshot_date para reconstruirla.
export async function listUploads(): Promise<{ data: UploadBatch[] | null; error: string | null }> {
  try {
    await requireSession();
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("metric_snapshots")
      .select("snapshot_date")
      .order("snapshot_date", { ascending: false });
    if (error) return { data: null, error: error.message };

    const counts = new Map<string, number>();
    for (const row of data ?? []) {
      const date = row.snapshot_date as string;
      counts.set(date, (counts.get(date) ?? 0) + 1);
    }
    const batches = Array.from(counts.entries()).map(([snapshotDate, postCount]) => ({
      snapshotDate,
      postCount,
    }));
    return { data: batches, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : "No se pudo leer las cargas." };
  }
}

export type DeleteUploadSummary = {
  snapshotsEliminados: number;
  postsEliminados: number;
};

export async function deleteUpload(
  snapshotDate: string
): Promise<{ data: DeleteUploadSummary | null; error: string | null }> {
  try {
    await requireSession();
    const supabase = createAdminClient();

    const { data: deleted, error: deleteError } = await supabase
      .from("metric_snapshots")
      .delete()
      .eq("snapshot_date", snapshotDate)
      .select("post_id");
    if (deleteError) return { data: null, error: deleteError.message };

    const affectedPostIds = Array.from(new Set((deleted ?? []).map((r) => r.post_id as string)));
    let postsEliminados = 0;
    if (affectedPostIds.length > 0) {
      const { data: remaining, error: remainingError } = await supabase
        .from("metric_snapshots")
        .select("post_id")
        .in("post_id", affectedPostIds);
      if (remainingError) return { data: null, error: remainingError.message };

      const stillHaveSnapshots = new Set((remaining ?? []).map((r) => r.post_id as string));
      const orphanIds = affectedPostIds.filter((id) => !stillHaveSnapshots.has(id));
      if (orphanIds.length > 0) {
        const { error: orphanError } = await supabase.from("posts").delete().in("id", orphanIds);
        if (orphanError) return { data: null, error: orphanError.message };
        postsEliminados = orphanIds.length;
      }
    }

    revalidatePath("/");
    revalidatePath("/rankings");

    return {
      data: { snapshotsEliminados: deleted?.length ?? 0, postsEliminados },
      error: null,
    };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : "No se pudo eliminar la carga." };
  }
}

export type DuplicateCandidate = {
  postA: { id: string; slug: string; title: string; publishedAt: string | null };
  postB: { id: string; slug: string; title: string; publishedAt: string | null };
  similarity: number;
};

// Compara todos los posts entre sí por similitud de slug/título y devuelve
// los pares que probablemente sean el mismo post cargado dos veces (ver
// lib/dedupe.ts para el motivo). No modifica nada: solo detecta, la fusión
// la confirma un humano con mergeDuplicatePosts.
export async function findDuplicateCandidates(): Promise<{ data: DuplicateCandidate[] | null; error: string | null }> {
  try {
    await requireSession();
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("posts")
      .select("id, slug, title, published_at")
      .order("title");
    if (error) return { data: null, error: error.message };

    const posts = data ?? [];
    const candidates: DuplicateCandidate[] = [];
    for (let i = 0; i < posts.length; i++) {
      for (let j = i + 1; j < posts.length; j++) {
        // Comparamos por slug Y por título: un post cargado con el slug
        // crudo como título puede parecerse poco en slug (Substack lo
        // truncó distinto) pero el título real sigue siendo reconocible, o
        // viceversa.
        const sim = Math.max(
          similarity(posts[i].slug, posts[j].slug),
          similarity(posts[i].title, posts[j].title)
        );
        const threshold =
          looksLikeSlug(posts[i].title) || looksLikeSlug(posts[j].title)
            ? SLUG_TITLE_SIMILARITY_THRESHOLD
            : DUPLICATE_SIMILARITY_THRESHOLD;
        if (sim >= threshold) {
          candidates.push({
            postA: {
              id: posts[i].id,
              slug: posts[i].slug,
              title: posts[i].title,
              publishedAt: posts[i].published_at,
            },
            postB: {
              id: posts[j].id,
              slug: posts[j].slug,
              title: posts[j].title,
              publishedAt: posts[j].published_at,
            },
            similarity: sim,
          });
        }
      }
    }
    candidates.sort((a, b) => b.similarity - a.similarity);
    return { data: candidates, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : "No se pudo buscar duplicados." };
  }
}

export type MergeSummary = { snapshotsMovidos: number; snapshotsDescartados: number };

// Combina dos posts que son en realidad el mismo: mueve las métricas de
// discardId hacia keepId (salvo las semanas que keepId ya tiene, esas se
// descartan porque metric_snapshots tiene unique(post_id, snapshot_date)) y
// elimina el post duplicado. Operación destructiva — se confirma a mano
// desde /subir, post por post, nunca en lote automático.
export async function mergeDuplicatePosts(
  keepId: string,
  discardId: string
): Promise<{ data: MergeSummary | null; error: string | null }> {
  try {
    await requireSession();
    if (keepId === discardId) return { data: null, error: "Los dos posts son el mismo." };
    const supabase = createAdminClient();

    const { data: discardSnaps, error: discardError } = await supabase
      .from("metric_snapshots")
      .select("id, snapshot_date")
      .eq("post_id", discardId);
    if (discardError) return { data: null, error: discardError.message };

    const { data: keepSnaps, error: keepError } = await supabase
      .from("metric_snapshots")
      .select("snapshot_date")
      .eq("post_id", keepId);
    if (keepError) return { data: null, error: keepError.message };

    const keepDates = new Set((keepSnaps ?? []).map((s) => s.snapshot_date as string));
    const toMove = (discardSnaps ?? []).filter((s) => !keepDates.has(s.snapshot_date as string));
    const toDrop = (discardSnaps ?? []).filter((s) => keepDates.has(s.snapshot_date as string));

    if (toMove.length > 0) {
      const { error: moveError } = await supabase
        .from("metric_snapshots")
        .update({ post_id: keepId })
        .in(
          "id",
          toMove.map((s) => s.id)
        );
      if (moveError) return { data: null, error: moveError.message };
    }
    if (toDrop.length > 0) {
      const { error: dropError } = await supabase
        .from("metric_snapshots")
        .delete()
        .in(
          "id",
          toDrop.map((s) => s.id)
        );
      if (dropError) return { data: null, error: dropError.message };
    }

    const { error: deletePostError } = await supabase.from("posts").delete().eq("id", discardId);
    if (deletePostError) return { data: null, error: deletePostError.message };

    revalidatePath("/");
    revalidatePath("/rankings");
    revalidatePath("/dashboards");
    revalidatePath("/promedios");

    return {
      data: { snapshotsMovidos: toMove.length, snapshotsDescartados: toDrop.length },
      error: null,
    };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : "No se pudo combinar los posts." };
  }
}
