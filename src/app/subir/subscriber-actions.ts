"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/session";
import { parseUploadedFile } from "@/lib/parse";
import { resolveSubscriberColumns, parseSections } from "@/lib/subscriber-columns";
import {
  cellToString,
  parseDateValue,
  parseIntValue,
  parseMoneyValue,
  parseTimestampValue,
} from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/server";

export type SubscriberParsePreview = {
  headers: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  emailColumnFound: boolean;
};

export async function parseSubscriberFile(
  formData: FormData
): Promise<{ data: SubscriberParsePreview | null; error: string | null }> {
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
    const columns = resolveSubscriberColumns(headers);
    if (!columns.email) {
      return { data: null, error: "No se encontró la columna \"Email\" en el archivo." };
    }
    return {
      data: { headers, rows, rowCount: rows.length, emailColumnFound: true },
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

// Divide un arreglo en bloques: Supabase/Postgres no tiene problema con miles
// de filas, pero mandarlas todas en un solo request es frágil (timeouts,
// límites de payload). 500 es un tamaño cómodo para ~4000 suscriptores.
function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

export async function commitSubscriberImport(input: {
  rows: Record<string, unknown>[];
  headers: string[];
  snapshotDate: string;
}): Promise<{ data: SubscriberImportSummary | null; error: string | null }> {
  try {
    await requireSession();
    const { rows, headers, snapshotDate } = input;
    const cols = resolveSubscriberColumns(headers);

    if (!cols.email) {
      return { data: null, error: "No se encontró la columna \"Email\" en el archivo." };
    }
    if (!snapshotDate) {
      return { data: null, error: "Falta la fecha del snapshot." };
    }

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
        country: cols.country ? cellToString(get("country")) : undefined,
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

    const supabase = createAdminClient();
    const emails = Array.from(subscribersByEmail.keys());

    const { data: existing, error: existingError } = await supabase
      .from("subscribers")
      .select("email")
      .in("email", emails);
    if (existingError) {
      return { data: null, error: `No se pudo leer suscriptores existentes: ${existingError.message}` };
    }
    const existingEmails = new Set((existing ?? []).map((s) => s.email as string));

    const subscribersPayload = Array.from(subscribersByEmail.values());
    const idByEmail = new Map<string, string>();
    for (const batch of chunk(subscribersPayload, 500)) {
      const { data: upserted, error: upsertError } = await supabase
        .from("subscribers")
        .upsert(batch, { onConflict: "email" })
        .select("id, email");
      if (upsertError || !upserted) {
        return { data: null, error: `No se pudo guardar los suscriptores: ${upsertError?.message}` };
      }
      for (const row of upserted) idByEmail.set(row.email as string, row.id as string);
    }

    const snapshotsPayload = Array.from(snapshotsByEmail.entries())
      .map(([email, snap]) => ({ subscriber_id: idByEmail.get(email), ...snap }))
      .filter((s) => s.subscriber_id);

    for (const batch of chunk(snapshotsPayload, 500)) {
      const { error: snapshotError } = await supabase
        .from("subscriber_snapshots")
        .upsert(batch, { onConflict: "subscriber_id,snapshot_date" });
      if (snapshotError) {
        return { data: null, error: `No se pudo guardar las métricas: ${snapshotError.message}` };
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
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("subscriber_snapshots")
      .select("snapshot_date")
      .order("snapshot_date", { ascending: false });
    if (error) return { data: null, error: error.message };

    const counts = new Map<string, number>();
    for (const row of data ?? []) {
      const date = row.snapshot_date as string;
      counts.set(date, (counts.get(date) ?? 0) + 1);
    }
    const batches = Array.from(counts.entries()).map(([snapshotDate, subscriberCount]) => ({
      snapshotDate,
      subscriberCount,
    }));
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
    const supabase = createAdminClient();

    const { data: deleted, error: deleteError } = await supabase
      .from("subscriber_snapshots")
      .delete()
      .eq("snapshot_date", snapshotDate)
      .select("subscriber_id");
    if (deleteError) return { data: null, error: deleteError.message };

    const affectedIds = Array.from(new Set((deleted ?? []).map((r) => r.subscriber_id as string)));
    let subscribersEliminados = 0;
    if (affectedIds.length > 0) {
      const { data: remaining, error: remainingError } = await supabase
        .from("subscriber_snapshots")
        .select("subscriber_id")
        .in("subscriber_id", affectedIds);
      if (remainingError) return { data: null, error: remainingError.message };

      const stillHaveSnapshots = new Set((remaining ?? []).map((r) => r.subscriber_id as string));
      const orphanIds = affectedIds.filter((id) => !stillHaveSnapshots.has(id));
      if (orphanIds.length > 0) {
        const { error: orphanError } = await supabase.from("subscribers").delete().in("id", orphanIds);
        if (orphanError) return { data: null, error: orphanError.message };
        subscribersEliminados = orphanIds.length;
      }
    }

    revalidatePath("/suscriptores");
    revalidatePath("/suscriptores/lista");

    return {
      data: { snapshotsEliminados: deleted?.length ?? 0, subscribersEliminados },
      error: null,
    };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : "No se pudo eliminar la carga." };
  }
}
