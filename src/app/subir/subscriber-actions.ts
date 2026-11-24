"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/session";
import { parseUploadedFile } from "@/lib/parse";
import { importSubscribers, validateSubscriberSheet, type SubscriberImportSummary } from "@/lib/imports/subscribers";
import { query } from "@/lib/db";

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
  const sheet = await parseUploadedFile(file);
  try {
    validateSubscriberSheet(sheet);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Archivo inválido." };
  }
  const { headers, rows } = sheet;
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
    return { data: await importSubscribers(parsed, snapshotDate), error: null };
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
