"use client";

import { useState, useTransition } from "react";
import {
  commitSubscriberImport,
  parseSubscriberFile,
  type SubscriberImportSummary,
  type SubscriberParsePreview,
} from "./subscriber-actions";

// A diferencia del Uploader de posts, acá no hay pantalla de mapeo: las
// columnas del export de Substack son siempre las mismas (ver
// lib/subscriber-columns.ts), así que solo se confirma la fecha del
// snapshot antes de importar.
export function SubscribersUploader() {
  const [preview, setPreview] = useState<SubscriberParsePreview | null>(null);
  const [snapshotDate, setSnapshotDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [summary, setSummary] = useState<SubscriberImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    setSummary(null);
    setPreview(null);
    const formData = new FormData();
    formData.set("file", file);
    startTransition(async () => {
      const result = await parseSubscriberFile(formData);
      if (result.error || !result.data) {
        setError(result.error ?? "No se pudo leer el archivo.");
        return;
      }
      setPreview(result.data);
    });
  }

  function handleConfirm() {
    if (!preview) return;
    startTransition(async () => {
      const result = await commitSubscriberImport({
        rows: preview.rows,
        headers: preview.headers,
        snapshotDate,
      });
      if (result.error || !result.data) {
        setError(result.error ?? "No se pudo importar el archivo.");
        return;
      }
      setSummary(result.data);
      setPreview(null);
    });
  }

  function handleReset() {
    setSummary(null);
    setError(null);
    setPreview(null);
  }

  return (
    <div className="space-y-8">
      {!preview && !summary && (
        <div>
          <label className="block cursor-pointer rounded-2xl border border-dashed border-border px-6 py-10 text-center text-sm text-muted transition-colors hover:border-accent hover:text-foreground">
            {pending ? "Leyendo archivo…" : "Elige el .csv/.xlsx de suscriptores de Substack"}
            <input
              type="file"
              accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={handleFileChange}
              disabled={pending}
              className="hidden"
            />
          </label>
        </div>
      )}

      {error && <p className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {preview && (
        <div className="space-y-6">
          <p className="text-sm text-muted">
            Detectamos {preview.rowCount.toLocaleString("es")} suscriptores en el archivo.
          </p>

          <div>
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">Fecha de este snapshot</h2>
            <p className="mb-3 text-sm text-muted">
              Se guarda igual para todos los suscriptores de esta carga (normalmente, hoy).
            </p>
            <input
              type="date"
              value={snapshotDate}
              onChange={(e) => setSnapshotDate(e.target.value)}
              className="rounded border border-border bg-transparent px-3 py-2 text-sm"
            />
          </div>

          <div className="flex items-center gap-4">
            <button onClick={handleConfirm} disabled={pending} className="btn-primary text-sm">
              {pending ? "Importando…" : "Confirmar e importar"}
            </button>
            <button onClick={handleReset} disabled={pending} className="text-sm text-muted underline">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {summary && (
        <div className="space-y-4 rounded-2xl border border-border px-6 py-6">
          <p className="text-sm">
            Listo. {summary.subscribersCreados} suscriptores nuevos, {summary.subscribersActualizados} actualizados,{" "}
            {summary.snapshots} snapshots guardados.
          </p>
          <button onClick={handleReset} className="text-sm font-medium text-accent underline underline-offset-2">
            Cargar otro archivo
          </button>
        </div>
      )}
    </div>
  );
}
