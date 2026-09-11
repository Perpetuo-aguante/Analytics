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
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<SubscriberParsePreview | null>(null);
  const [snapshotDate, setSnapshotDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [summary, setSummary] = useState<SubscriberImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    event.target.value = "";
    if (!selected) return;
    setError(null);
    setSummary(null);
    setPreview(null);
    setFile(null);
    const formData = new FormData();
    formData.set("file", selected);
    startTransition(async () => {
      const result = await parseSubscriberFile(formData);
      if (result.error || !result.data) {
        setError(result.error ?? "No se pudo leer el archivo.");
        return;
      }
      setPreview(result.data);
      setFile(selected);
    });
  }

  function handleConfirm() {
    // El archivo se vuelve a mandar (y se reparsea server-side) en lugar de
    // reenviar las filas ya parseadas: con miles de suscriptores, ese JSON
    // pesa mucho más que el archivo original y superaba el límite de tamaño
    // de body de las Server Actions (ver subscriber-actions.ts).
    if (!preview || !file) return;
    startTransition(async () => {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("snapshotDate", snapshotDate);
      const result = await commitSubscriberImport(formData);
      if (result.error || !result.data) {
        setError(result.error ?? "No se pudo importar el archivo.");
        return;
      }
      setSummary(result.data);
      setPreview(null);
      setFile(null);
    });
  }

  function handleReset() {
    setSummary(null);
    setError(null);
    setPreview(null);
    setFile(null);
  }

  return (
    <div className="space-y-8">
      {!preview && !summary && (
        <div>
          <label className="block cursor-pointer rounded-2xl border border-dashed border-line px-6 py-10 text-center text-sm text-ink-muted transition-colors hover:border-blue hover:text-ink">
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
          <p className="text-sm text-ink-muted">
            Detectamos {preview.rowCount.toLocaleString("es")} suscriptores en el archivo.
          </p>

          <div>
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-ink-muted">Fecha de este snapshot</h2>
            <p className="mb-3 text-sm text-ink-muted">
              Se guarda igual para todos los suscriptores de esta carga (normalmente, hoy).
            </p>
            <input
              type="date"
              value={snapshotDate}
              onChange={(e) => setSnapshotDate(e.target.value)}
              className="rounded border border-line bg-transparent px-3 py-2 text-sm"
            />
          </div>

          <div className="flex items-center gap-4">
            <button onClick={handleConfirm} disabled={pending} className="btn-primary text-sm">
              {pending ? "Importando…" : "Confirmar e importar"}
            </button>
            <button onClick={handleReset} disabled={pending} className="text-sm text-ink-muted underline">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {summary && (
        <div className="panel space-y-4 px-6 py-6">
          <p className="text-sm">
            Listo. {summary.subscribersCreados} suscriptores nuevos, {summary.subscribersActualizados} actualizados,{" "}
            {summary.snapshots} snapshots guardados.
          </p>
          <button onClick={handleReset} className="text-sm font-medium text-blue underline underline-offset-2">
            Cargar otro archivo
          </button>
        </div>
      )}
    </div>
  );
}
