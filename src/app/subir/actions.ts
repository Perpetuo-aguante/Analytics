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
import { suggestMapping, type FieldKey } from "@/lib/columns";
import { cellToString, parseDateValue, parseIntValue, parseRateValue, slugify } from "@/lib/format";
import { similarity } from "@/lib/dedupe";
import { createAdminClient } from "@/lib/supabase/server";

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
    return {
      data: { headers, rows, rowCount: rows.length, suggestedMapping: suggestMapping(headers) },
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

    const postsBySlug = new Map<string, PostRow>();
    const snapshotsBySlug = new Map<string, Record<string, unknown>>();

    for (const row of rows) {
      const title = cellToString(row[mapping.title]);
      if (!title) continue; // fila sin identidad de post: se ignora

      const slug = slugify(title);
      const post: PostRow = { slug, title };
      if (mapping.author) post.author = cellToString(row[mapping.author]);
      if (mapping.post_type) post.post_type = cellToString(row[mapping.post_type]);
      if (mapping.published_at) post.published_at = parseDateValue(row[mapping.published_at]);
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

    const supabase = createAdminClient();
    const postsPayload = Array.from(postsBySlug.values());
    const slugs = postsPayload.map((p) => p.slug);

    const { data: existing, error: existingError } = await supabase
      .from("posts")
      .select("slug")
      .in("slug", slugs);
    if (existingError) {
      return { data: null, error: `No se pudo leer posts existentes: ${existingError.message}` };
    }
    const existingSlugs = new Set((existing ?? []).map((p) => p.slug as string));

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
        postsCreados: postsPayload.length - existingSlugs.size,
        postsActualizados: existingSlugs.size,
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

// Umbral de similitud (0-1) para considerar dos posts "posibles duplicados".
// 0.82 detecta variantes como slug-crudo-vs-título-real sin generar
// demasiados falsos positivos entre títulos legítimamente distintos.
const DUPLICATE_SIMILARITY_THRESHOLD = 0.82;

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
        const sim = similarity(posts[i].slug, posts[j].slug);
        if (sim >= DUPLICATE_SIMILARITY_THRESHOLD) {
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
