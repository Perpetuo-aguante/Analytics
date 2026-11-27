import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { query } from "@/lib/db";
import { parseSheetBuffer, type ParsedSheet } from "@/lib/parse";

// Piezas comunes de la API de ingesta automática (app/api/ingest/*), la que
// usa el agente que descarga los exports de Substack (martes, jueves y
// sábado). Ver docs/ingest-api.md.

// La clave de escritura es distinta de ANALYTICS_API_KEY (la de lectura que
// usa n8n): así una filtración de la clave de n8n no permite modificar datos.
export function checkIngestKey(request: NextRequest): NextResponse | null {
  const expected = process.env.INGEST_API_KEY;
  if (!expected) {
    return NextResponse.json({ error: "INGEST_API_KEY no está configurada en el servidor." }, { status: 500 });
  }
  const header = request.headers.get("authorization");
  const provided = request.headers.get("x-api-key") ?? (header?.startsWith("Bearer ") ? header.slice(7) : null);
  if (!provided || !safeEqual(provided, expected)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  return null;
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

// La fecha del snapshot es el día de la descarga en la zona horaria de la
// redacción (INGEST_TIMEZONE, por defecto Ciudad de México), salvo que el
// agente mande ?snapshotDate=YYYY-MM-DD.
export function todayInTimezone(): string {
  const timeZone = process.env.INGEST_TIMEZONE || "America/Mexico_City";
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date()
  );
}

export function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export type IngestInput = {
  sheet: ParsedSheet;
  snapshotDate: string;
  dryRun: boolean;
  mapping: Record<string, string> | null;
};

// Lee la carga de cualquiera de las dos formas aceptadas:
// - multipart/form-data con un campo `file` (y opcionales `snapshotDate`,
//   `dryRun`, `mapping`);
// - el archivo crudo en el body (CSV, .xlsx o gzip), con las opciones en la
//   query string.
export async function readIngestRequest(request: NextRequest): Promise<IngestInput> {
  const params = request.nextUrl.searchParams;
  let snapshotDate = params.get("snapshotDate");
  let dryRun = params.get("dryRun");
  let mappingRaw = params.get("mapping");
  let buffer: Buffer;

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.startsWith("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) throw new IngestError("Falta el archivo en el campo `file`.", 400);
    buffer = Buffer.from(await file.arrayBuffer());
    snapshotDate = (form.get("snapshotDate") as string | null) ?? snapshotDate;
    dryRun = (form.get("dryRun") as string | null) ?? dryRun;
    mappingRaw = (form.get("mapping") as string | null) ?? mappingRaw;
  } else {
    buffer = Buffer.from(await request.arrayBuffer());
    if (buffer.length === 0) throw new IngestError("El body está vacío.", 400);
  }

  const date = snapshotDate?.trim() || todayInTimezone();
  if (!isValidDate(date)) throw new IngestError("snapshotDate debe tener formato YYYY-MM-DD.", 400);

  let mapping: Record<string, string> | null = null;
  if (mappingRaw) {
    try {
      mapping = JSON.parse(mappingRaw);
    } catch {
      throw new IngestError("`mapping` debe ser JSON, ej. {\"title\":\"post_id\"}.", 400);
    }
  }

  let sheet: ParsedSheet;
  try {
    sheet = await parseSheetBuffer(buffer);
  } catch (err) {
    throw new IngestError(`No se pudo leer el archivo: ${err instanceof Error ? err.message : String(err)}`, 400);
  }

  return { sheet, snapshotDate: date, dryRun: dryRun === "1" || dryRun === "true", mapping };
}

export class IngestError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

// Deja constancia de cada carga (exitosa o no) en ingest_runs. Si el propio
// registro falla, no se tumba la respuesta: lo importante es la carga.
export async function logIngestRun(run: {
  kind: "posts" | "subscribers" | "texts";
  snapshotDate: string | null;
  ok: boolean;
  dryRun: boolean;
  rowCount: number | null;
  summary: unknown;
  error: string | null;
  source: string | null;
}): Promise<void> {
  try {
    await query(
      `insert into ingest_runs (kind, snapshot_date, ok, dry_run, row_count, summary, error, source)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
      [
        run.kind,
        run.snapshotDate,
        run.ok,
        run.dryRun,
        run.rowCount,
        run.summary == null ? null : JSON.stringify(run.summary),
        run.error,
        run.source?.slice(0, 200) ?? null,
      ]
    );
  } catch (err) {
    console.error("No se pudo registrar la carga en ingest_runs:", err);
  }
}

export type IngestRun = {
  id: string;
  kind: "posts" | "subscribers" | "texts";
  snapshot_date: string | null;
  ok: boolean;
  dry_run: boolean;
  row_count: number | null;
  summary: Record<string, unknown> | null;
  error: string | null;
  created_at: string;
};

export function listRecentIngestRuns(limit = 15): Promise<IngestRun[]> {
  return query<IngestRun>(
    `select id, kind, snapshot_date, ok, dry_run, row_count, summary, error, created_at
     from ingest_runs order by created_at desc limit $1`,
    [limit]
  );
}
