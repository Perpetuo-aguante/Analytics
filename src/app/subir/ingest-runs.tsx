import { listRecentIngestRuns, type IngestRun } from "@/lib/ingest";

// Últimas cargas que llegaron por la API de ingesta (el agente automático).
// Sirve para ver de un vistazo si corrió y si algo falló.
export async function IngestRuns() {
  let runs: IngestRun[];
  try {
    runs = await listRecentIngestRuns();
  } catch (err) {
    return (
      <p className="text-sm text-red-700">
        No se pudo leer el registro de cargas automáticas: {err instanceof Error ? err.message : String(err)}
      </p>
    );
  }

  return (
    <div>
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-ink-muted">Cargas automáticas</h2>
      <p className="mb-4 text-sm text-ink-muted">
        Lo que subió el agente por la API de ingesta (martes, jueves y sábado). Las cargas manuales de esta página no
        aparecen acá.
      </p>
      {runs.length === 0 ? (
        <p className="text-sm text-ink-muted">Todavía no llegó ninguna carga automática.</p>
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line text-sm">
          {runs.map((run) => (
            <li key={run.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3">
              <span>
                <span aria-hidden>{run.ok ? "✓" : "✗"}</span>{" "}
                <span className="font-medium">{run.kind === "posts" ? "Posts" : "Suscriptores"}</span>
                {run.snapshot_date && <span className="text-ink-muted"> · snapshot {run.snapshot_date}</span>}
                {run.row_count != null && <span className="text-ink-muted"> · {run.row_count.toLocaleString("es")} filas</span>}
                {run.dry_run && <span className="text-ink-muted"> · prueba (sin guardar)</span>}
              </span>
              <time className="text-xs text-ink-muted" dateTime={run.created_at}>
                {formatTimestamp(run.created_at)}
              </time>
              {!run.ok && run.error && <p className="w-full text-xs text-red-700">{run.error}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatTimestamp(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: process.env.INGEST_TIMEZONE || "America/Mexico_City",
  }).format(new Date(iso));
}
