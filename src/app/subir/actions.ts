"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  checkPassword,
  createSessionCookieValue,
  isValidSessionCookieValue,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE,
} from "@/lib/session";
import { parseUploadedFile } from "@/lib/parse";
import { suggestMapping, type FieldKey } from "@/lib/columns";
import { cellToString, parseDateValue, parseIntValue, parseRateValue, slugify } from "@/lib/format";
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

async function requireSession() {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!isValidSessionCookieValue(session)) {
    throw new Error("Sesión expirada. Vuelve a iniciar sesión.");
  }
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
