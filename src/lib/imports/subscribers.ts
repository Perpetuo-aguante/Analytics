// Importación del export de suscriptores de Substack: la usan tanto la carga
// manual de /subir (app/subir/subscriber-actions.ts) como la API de ingesta
// automática (app/api/ingest/subscribers/route.ts). Las funciones lanzan
// Error con un mensaje legible si algo falla.

import { revalidatePath } from "next/cache";
import { countryFromEmail } from "@/lib/geo";
import { resolveSubscriberColumns, parseSections } from "@/lib/subscriber-columns";
import {
  cellToString,
  parseDateValue,
  parseIntValue,
  parseMoneyValue,
  parseTimestampValue,
} from "@/lib/format";
import { query, upsertRows } from "@/lib/db";
import type { ParsedSheet } from "@/lib/parse";
import { pruneSubscriberSnapshots } from "@/lib/imports/retention-policy";

export type SubscriberImportSummary = {
  subscribersCreados: number;
  subscribersActualizados: number;
  snapshots: number;
  // Snapshots viejos que se borraron por la política de almacenamiento.
  snapshotsDepurados: number;
};

// Valida que el archivo tenga filas y la columna "Email".
export function validateSubscriberSheet(sheet: ParsedSheet): void {
  if (sheet.headers.length === 0) throw new Error("No se detectaron columnas en el archivo.");
  if (sheet.rows.length === 0) throw new Error("El archivo no tiene filas de datos.");
  if (!resolveSubscriberColumns(sheet.headers).email) {
    throw new Error('No se encontró la columna "Email" en el archivo.');
  }
}

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

// Guarda cada suscriptor (identidad, por email) y un snapshot de su
// actividad con la fecha dada, y después aplica la política de
// almacenamiento (ver lib/imports/retention-policy.ts). Volver a importar la
// misma fecha actualiza ese snapshot. Un export grande puede llegar partido
// en varios archivos con la misma fecha: cada parte suma sus filas.
export async function importSubscribers(sheet: ParsedSheet, snapshotDate: string): Promise<SubscriberImportSummary> {
  validateSubscriberSheet(sheet);
  const { headers, rows } = sheet;
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
    throw new Error("Ninguna fila tiene email válido.");
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
      throw new Error(`No se pudo guardar los suscriptores: ${describeError(err)}`);
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
      throw new Error(`No se pudo guardar las métricas: ${describeError(err)}`);
    }
  }

  const snapshotsDepurados = await pruneSubscriberSnapshots();

  revalidatePath("/suscriptores", "layout");

  return {
    subscribersCreados: subscribersPayload.length - existingEmails.size,
    subscribersActualizados: existingEmails.size,
    snapshots: snapshotsPayload.length,
    snapshotsDepurados,
  };
}
