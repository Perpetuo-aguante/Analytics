"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/session";
import { countryFromEmail } from "@/lib/geo";
import { parseUploadedFile } from "@/lib/parse";
import { resolveSubscriberColumns, parseSections } from "@/lib/subscriber-columns";
import {
  cellToString,
  parseDateValue,
  parseIntValue,
  parseMoneyValue,
  parseTimestampValue,
} from "@/lib/format";
import { query, upsertRows } from "@/lib/db";

// A diferencia del Uploader de posts (que sí necesita rows en el cliente
// para la pantalla de mapeo y la vista previa de la tabla), acá la vista
// previa solo muestra un conteo, así que no hace falta viajar con las
// filas completas: un export de Substack con miles de suscriptores tiene
// ~40 columnas por fila, y ese JSON pesa varias veces más que el archivo
// original (que va comprimido si es .xlsx, o sin repetir los nombres de
// columna en cada fila si es .csv). Devolver `rows` acá y mandarlas de
// vuelta en commitSubscriberImport superaba el límite de tamaño de body de
// las Server Actions con listas grandes — de ahí que el archivo se vuelva
// a parsear server-side en el commit en lugar de reenviar las filas ya
// parseadas.
export type SubscriberParsePreview = {
  headers: string[];
  rowCount: number;
  emailColumnFound: boolean;
};

type SubscriberFileResult =
  | { ok: true; headers: string[]; rows: Record<string, unknown>[] }
  | { ok: false; error: string };

async function readAndValidateSubscriberFile(formData: FormData): Promise<SubscriberFileResult> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Selecciona un archivo .xlsx o .csv." };
  }
  const { headers, rows } = await parseUploadedFile(file);
  if (headers.length === 0) {
    return { ok: false, error: "No se detectaron columnas en el archivo." };
  }
  if (rows.length === 0) {
    return { ok: false, error: "El archivo no tiene filas de datos." };
  }
  const columns = resolveSubscriberColumns(headers);
  if (!columns.email) {
    return { ok: false, error: "No se encontró la columna \"Email\" en el archivo." };
  }
  return { ok: true, headers, rows };
}

export async function parseSubscriberFile(
  formData: FormData
): Promise<{ data: SubscriberParsePreview | null; error: string | null }> {
  try {
    await requireSession();
    const result = await readAndValidateSubscriberFile(formData);
    if (!result.ok) return { data: null, error: result.error };
    return {
      data: { headers: result.headers, rowCount: result.rows.length, emailColumnFound: true },
      error: null,
    };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : "No se pudo leer el archivo." };
  }
}

export type SubscriberImportSummary = {
  subscribersCreados: number;
  subscribersActualizados: number;
  snapshots: number;
};

// Divide un arreglo en bloques: Postgres no tiene problema con miles de
// filas, pero mandarlas todas en una sola consulta es frágil.
function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

// Tamaño de bloque para upserts (cada bloque viaja como un parámetro JSON).
const UPSERT_CHUNK_SIZE = 500;

// Deja siempre un mensaje legible, aunque el error no traiga `.message`.
function describeError(error: unknown): string {
  if (!error) return "Error desconocido.";
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  const code = (error as { code?: string }).code;
  return code ? `Error ${code}.` : String(error);
}

export async function commitSubscriberImport(
  formData: FormData
): Promise<{ data: SubscriberImportSummary | null; error: string | null }> {
  try {
    await requireSession();
    const snapshotDate = String(formData.get("snapshotDate") ?? "");
    if (!snapshotDate) {
      return { data: null, error: "Falta la fecha del snapshot." };
    }

    const parsed = await readAndValidateSubscriberFile(formData);
    if (!parsed.ok) return { data: null, error: parsed.error };
    const { headers, rows } = parsed;
    const cols = resolveSubscriberColumns(headers);

    type SubscriberRow = {
      email: string;
      name?: string | null;
      type?: string | null;
      stripe_plan?: string | null;
      start_date?: string | null;
      cancel_date?: string | null;
      paid_upgrade_date?: string | null;
      first_paid_date?: string | null;
      expiration_date?: string | null;
      subscription_source_free?: string | null;
      subscription_source_paid?: string | null;
      country?: string | null;
      state_province?: string | null;
      sections?: string[];
    };

    const subscribersByEmail = new Map<string, SubscriberRow>();
    const snapshotsByEmail = new Map<string, Record<string, unknown>>();

    for (const row of rows) {
      const rawEmail = cellToString(row[cols.email as string]);
      if (!rawEmail) continue; // fila sin identidad de suscriptor: se ignora
      const email = rawEmail.toLowerCase();

      const get = (field: keyof typeof cols) => (cols[field] ? row[cols[field] as string] : undefined);

      subscribersByEmail.set(email, {
        email,
        name: cols.name ? cellToString(get("name")) : undefined,
        type: cols.type ? cellToString(get("type")) : undefined,
        stripe_plan: cols.stripe_plan ? cellToString(get("stripe_plan")) : undefined,
        start_date: cols.start_date ? parseDateValue(get("start_date")) : undefined,
        cancel_date: cols.cancel_date ? parseDateValue(get("cancel_date")) : undefined,
        paid_upgrade_date: cols.paid_upgrade_date ? parseDateValue(get("paid_upgrade_date")) : undefined,
        first_paid_date: cols.first_paid_date ? parseDateValue(get("first_paid_date")) : undefined,
        expiration_date: cols.expiration_date ? parseDateValue(get("expiration_date")) : undefined,
        subscription_source_free: cols.subscription_source_free
          ? cellToString(get("subscription_source_free"))
          : undefined,
        subscription_source_paid: cols.subscription_source_paid
          ? cellToString(get("subscription_source_paid"))
          : undefined,
        // El dominio institucional manda sobre lo que traiga el export (ver
        // countryFromEmail en lib/geo.ts); si no aplica, queda el país del CSV.
        country: countryFromEmail(email) ?? (cols.country ? cellToString(get("country")) : undefined),
        state_province: cols.state_province ? cellToString(get("state_province")) : undefined,
        sections: cols.sections ? parseSections(get("sections")) : undefined,
      });

      snapshotsByEmail.set(email, {
        snapshot_date: snapshotDate,
        revenue: cols.revenue ? parseMoneyValue(get("revenue")) : null,
        subscriptions_gifted: cols.subscriptions_gifted ? parseIntValue(get("subscriptions_gifted")) : null,
        bestseller: cols.bestseller ? parseIntValue(get("bestseller")) : null,
        emails_received_6mo: cols.emails_received_6mo ? parseIntValue(get("emails_received_6mo")) : null,
        emails_dropped_6mo: cols.emails_dropped_6mo ? parseIntValue(get("emails_dropped_6mo")) : null,
        emails_opened_6mo: cols.emails_opened_6mo ? parseIntValue(get("emails_opened_6mo")) : null,
        emails_opened_7d: cols.emails_opened_7d ? parseIntValue(get("emails_opened_7d")) : null,
        emails_opened_30d: cols.emails_opened_30d ? parseIntValue(get("emails_opened_30d")) : null,
        num_emails_opened: cols.num_emails_opened ? parseIntValue(get("num_emails_opened")) : null,
        last_email_open: cols.last_email_open ? parseTimestampValue(get("last_email_open")) : null,
        links_clicked: cols.links_clicked ? parseIntValue(get("links_clicked")) : null,
        last_clicked_at: cols.last_clicked_at ? parseTimestampValue(get("last_clicked_at")) : null,
        unique_emails_seen_6mo: cols.unique_emails_seen_6mo ? parseIntValue(get("unique_emails_seen_6mo")) : null,
        unique_emails_seen_7d: cols.unique_emails_seen_7d ? parseIntValue(get("unique_emails_seen_7d")) : null,
        unique_emails_seen_30d: cols.unique_emails_seen_30d ? parseIntValue(get("unique_emails_seen_30d")) : null,
        post_views: cols.post_views ? parseIntValue(get("post_views")) : null,
        post_views_7d: cols.post_views_7d ? parseIntValue(get("post_views_7d")) : null,
        post_views_30d: cols.post_views_30d ? parseIntValue(get("post_views_30d")) : null,
        unique_posts_seen: cols.unique_posts_seen ? parseIntValue(get("unique_posts_seen")) : null,
        unique_posts_seen_7d: cols.unique_posts_seen_7d ? parseIntValue(get("unique_posts_seen_7d")) : null,
        unique_posts_seen_30d: cols.unique_posts_seen_30d ? parseIntValue(get("unique_posts_seen_30d")) : null,
        comments: cols.comments ? parseIntValue(get("comments")) : null,
        comments_7d: cols.comments_7d ? parseIntValue(get("comments_7d")) : null,
        comments_30d: cols.comments_30d ? parseIntValue(get("comments_30d")) : null,
        shares: cols.shares ? parseIntValue(get("shares")) : null,
        shares_7d: cols.shares_7d ? parseIntValue(get("shares_7d")) : null,
        shares_30d: cols.shares_30d ? parseIntValue(get("shares_30d")) : null,
        days_active_30d: cols.days_active_30d ? parseIntValue(get("days_active_30d")) : null,
        activity: cols.activity ? parseIntValue(get("activity")) : null,
      });
    }

    if (subscribersByEmail.size === 0) {
      return { data: null, error: "Ninguna fila tiene email válido." };
    }

    const emails = Array.from(subscribersByEmail.keys());

    const existingEmails = new Set(
      (await query<{ email: string }>("select email from subscribers where email = any($1::text[])", [emails])).map(
        (row) => row.email
      )
    );

    const subscribersPayload = Array.from(subscribersByEmail.values());
    const idByEmail = new Map<string, string>();
    for (const batch of chunk(subscribersPayload, UPSERT_CHUNK_SIZE)) {
      let upserted: { id: string; email: string }[];
      try {
        upserted = await upsertRows<{ id: string; email: string }>("subscribers", batch, ["email"], ["id", "email"]);
      } catch (err) {
        return { data: null, error: `No se pudo guardar los suscriptores: ${describeError(err)}` };
      }
      for (const row of upserted) idByEmail.set(row.email, row.id);
    }

    const snapshotsPayload = Array.from(snapshotsByEmail.entries())
      .map(([email, snap]) => ({ subscriber_id: idByEmail.get(email), ...snap }))
      .filter((s) => s.subscriber_id);

    for (const batch of chunk(snapshotsPayload, UPSERT_CHUNK_SIZE)) {
      try {
        await upsertRows("subscriber_snapshots", batch, ["subscriber_id", "snapshot_date"]);
      } catch (err) {
        return { data: null, error: `No se pudo guardar las métricas: ${describeError(err)}` };
      }
    }

    revalidatePath("/suscriptores");
    revalidatePath("/suscriptores/lista");

    return {
      data: {
        subscribersCreados: subscribersPayload.length - existingEmails.size,
        subscribersActualizados: existingEmails.size,
        snapshots: snapshotsPayload.length,
      },
      error: null,
    };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : "No se pudo importar el archivo." };
  }
}

export type SubscriberUploadBatch = {
  snapshotDate: string;
  subscriberCount: number;
};

export async function listSubscriberUploads(): Promise<{
  data: SubscriberUploadBatch[] | null;
  error: string | null;
}> {
  try {
    await requireSession();
    const rows = await query<{ snapshot_date: string; subscriber_count: number }>(
      `select snapshot_date, count(*)::int as subscriber_count
       from subscriber_snapshots group by snapshot_date order by snapshot_date desc`
    );
    const batches = rows.map((r) => ({ snapshotDate: r.snapshot_date, subscriberCount: r.subscriber_count }));
    return { data: batches, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : "No se pudo leer las cargas." };
  }
}

export type DeleteSubscriberUploadSummary = {
  snapshotsEliminados: number;
  subscribersEliminados: number;
};

export async function deleteSubscriberUpload(
  snapshotDate: string
): Promise<{ data: DeleteSubscriberUploadSummary | null; error: string | null }> {
  try {
    await requireSession();
    // Se borran las métricas de esa carga y, en la misma transacción, los
    // suscriptores que quedaron sin ninguna métrica.
    const [counts] = await query<{ snapshots: number; subscribers: number }>(
      `with deleted as (
         delete from subscriber_snapshots where snapshot_date = $1 returning subscriber_id
       ), orphans as (
         delete from subscribers s
         where s.id in (select subscriber_id from deleted)
           and not exists (
             select 1 from subscriber_snapshots ss where ss.subscriber_id = s.id and ss.snapshot_date <> $1
           )
         returning s.id
       )
       select (select count(*) from deleted)::int as snapshots, (select count(*) from orphans)::int as subscribers`,
      [snapshotDate]
    );
    const subscribersEliminados = counts.subscribers;

    revalidatePath("/suscriptores");
    revalidatePath("/suscriptores/lista");

    return {
      data: { snapshotsEliminados: counts.snapshots, subscribersEliminados },
      error: null,
    };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : "No se pudo eliminar la carga." };
  }
}
