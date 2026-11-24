import { NextResponse, type NextRequest } from "next/server";
import { checkIngestKey, IngestError, logIngestRun, readIngestRequest } from "@/lib/ingest";
import { importPosts, preparePostSheet, type PostMapping } from "@/lib/imports/posts";
import { FIELD_LABELS, REQUIRED_FIELDS } from "@/lib/columns";

// POST /api/ingest/posts — carga automática del export de posts de Substack.
// Ver docs/ingest-api.md.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const denied = checkIngestKey(request);
  if (denied) return denied;

  const source = request.headers.get("user-agent");
  let snapshotDate: string | null = null;
  let dryRun = false;
  let rowCount: number | null = null;

  try {
    const input = await readIngestRequest(request);
    snapshotDate = input.snapshotDate;
    dryRun = input.dryRun;

    const prepared = preparePostSheet(input.sheet);
    rowCount = prepared.rowCount;
    // El mapeo automático (el mismo que sugiere /subir) se puede corregir
    // campo por campo con `mapping`, ej. {"title":"post_id"}.
    const mapping: PostMapping = { ...prepared.suggestedMapping };
    for (const [field, header] of Object.entries(input.mapping ?? {})) {
      if (!(field in mapping)) throw new IngestError(`Campo desconocido en mapping: ${field}`, 400);
      if (header && !prepared.headers.includes(header)) {
        throw new IngestError(`La columna "${header}" no está en el archivo.`, 400);
      }
      mapping[field as keyof PostMapping] = header || null;
    }
    const missing = REQUIRED_FIELDS.filter((field) => !mapping[field]);
    if (missing.length > 0) {
      throw new IngestError(
        `No se reconoció la columna de: ${missing.map((f) => FIELD_LABELS[f]).join(", ")}. ` +
          `Columnas del archivo: ${prepared.headers.join(", ")}`,
        422
      );
    }

    if (dryRun) {
      const result = { ok: true, dryRun: true, snapshotDate, rows: rowCount, mapping };
      await logIngestRun({ kind: "posts", snapshotDate, ok: true, dryRun, rowCount, summary: { mapping }, error: null, source });
      return NextResponse.json(result);
    }

    const summary = await importPosts({ rows: prepared.rows, mapping, snapshotDate });
    await logIngestRun({ kind: "posts", snapshotDate, ok: true, dryRun, rowCount, summary, error: null, source });
    return NextResponse.json({ ok: true, snapshotDate, rows: rowCount, mapping, summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = err instanceof IngestError ? err.status : 500;
    await logIngestRun({ kind: "posts", snapshotDate, ok: false, dryRun, rowCount, summary: null, error: message, source });
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
