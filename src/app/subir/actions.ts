"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/session";
import { parseUploadedFile } from "@/lib/parse";
import { looksLikeSlug, similarity } from "@/lib/dedupe";
import {
  DUPLICATE_SIMILARITY_THRESHOLD,
  SLUG_TITLE_SIMILARITY_THRESHOLD,
  importPosts,
  preparePostSheet,
  type ImportSummary,
  type PostMapping,
  type PreparedPostSheet,
} from "@/lib/imports/posts";
import { query, transaction } from "@/lib/db";

export type ParsePreview = PreparedPostSheet;

export async function parseFile(
  formData: FormData
): Promise<{ data: ParsePreview | null; error: string | null }> {
  try {
    await requireSession();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { data: null, error: "Selecciona un archivo .xlsx o .csv." };
    }
    return { data: preparePostSheet(await parseUploadedFile(file)), error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : "No se pudo leer el archivo." };
  }
}


export async function commitImport(input: { rows: Record<string, unknown>[]; mapping: PostMapping; snapshotDate: string }): Promise<{ data: ImportSummary | null; error: string | null }> {
  try {
    await requireSession();
    return { data: await importPosts(input), error: null };
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
    const rows = await query<{ snapshot_date: string; post_count: number }>(
      `select snapshot_date, count(*)::int as post_count
       from metric_snapshots group by snapshot_date order by snapshot_date desc`
    );
    const batches = rows.map((r) => ({ snapshotDate: r.snapshot_date, postCount: r.post_count }));
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
    // Se borran las métricas de esa carga y, en la misma transacción, los
    // posts que quedaron sin ninguna métrica (los que solo existían por esa
    // carga).
    // (Dentro de una misma sentencia, las CTE ven la tabla como estaba antes
    // del delete; por eso se excluye la fecha borrada al buscar otras.)
    const [counts] = await query<{ snapshots: number; posts: number }>(
      `with deleted as (
         delete from metric_snapshots where snapshot_date = $1 returning post_id
       ), orphans as (
         delete from posts p
         where p.id in (select post_id from deleted)
           and not exists (
             select 1 from metric_snapshots ms where ms.post_id = p.id and ms.snapshot_date <> $1
           )
         returning p.id
       )
       select (select count(*) from deleted)::int as snapshots, (select count(*) from orphans)::int as posts`,
      [snapshotDate]
    );
    const postsEliminados = counts.posts;

    revalidatePath("/");
    revalidatePath("/rankings");

    return {
      data: { snapshotsEliminados: counts.snapshots, postsEliminados },
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
    const posts = await query<{ id: string; slug: string; title: string; published_at: string | null }>(
      "select id, slug, title, published_at from posts order by title"
    );
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
    // Todo en una transacción: primero se descartan las semanas que keepId ya
    // tiene, después se mueve el resto y al final se borra el duplicado.
    const [dropped, moved] = await transaction([
      {
        text: `delete from metric_snapshots
               where post_id = $1
                 and snapshot_date in (select snapshot_date from metric_snapshots where post_id = $2)
               returning id`,
        params: [discardId, keepId],
      },
      {
        text: "update metric_snapshots set post_id = $2 where post_id = $1 returning id",
        params: [discardId, keepId],
      },
      { text: "delete from posts where id = $1", params: [discardId] },
    ]);

    revalidatePath("/");
    revalidatePath("/rankings");
    revalidatePath("/dashboards");
    revalidatePath("/promedios");

    return {
      data: { snapshotsMovidos: moved.length, snapshotsDescartados: dropped.length },
      error: null,
    };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : "No se pudo combinar los posts." };
  }
}
