import { NextResponse, type NextRequest } from "next/server";
import { checkIngestKey, IngestError, logIngestRun, readIngestRequest } from "@/lib/ingest";
import { importSubscribers, validateSubscriberSheet } from "@/lib/imports/subscribers";

// POST /api/ingest/subscribers — carga automática del export de suscriptores
// de Substack. Un export grande puede mandarse en varias partes (cada una con
// su fila de encabezados y la misma snapshotDate). Ver docs/ingest-api.md.
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
    rowCount = input.sheet.rows.length;
    try {
      validateSubscriberSheet(input.sheet);
    } catch (err) {
      throw new IngestError(err instanceof Error ? err.message : String(err), 422);
    }

    if (dryRun) {
      await logIngestRun({ kind: "subscribers", snapshotDate, ok: true, dryRun, rowCount, summary: null, error: null, source });
      return NextResponse.json({ ok: true, dryRun: true, snapshotDate, rows: rowCount, columns: input.sheet.headers });
    }

    const summary = await importSubscribers(input.sheet, snapshotDate);
    await logIngestRun({ kind: "subscribers", snapshotDate, ok: true, dryRun, rowCount, summary, error: null, source });
    return NextResponse.json({ ok: true, snapshotDate, rows: rowCount, summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = err instanceof IngestError ? err.status : 500;
    await logIngestRun({ kind: "subscribers", snapshotDate, ok: false, dryRun, rowCount, summary: null, error: message, source });
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
