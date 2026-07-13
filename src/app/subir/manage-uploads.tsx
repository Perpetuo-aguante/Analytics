"use client";

import { useEffect, useState, useTransition } from "react";
import { deleteUpload, listUploads, type UploadBatch } from "./actions";

export function ManageUploads() {
  const [uploads, setUploads] = useState<UploadBatch[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function load() {
    startTransition(async () => {
      const result = await listUploads();
      if (result.error || !result.data) {
        setError(result.error ?? "No se pudo leer las cargas.");
        return;
      }
      setError(null);
      setUploads(result.data);
    });
  }

  useEffect(load, []);

  function handleDelete(snapshotDate: string) {
    startTransition(async () => {
      const result = await deleteUpload(snapshotDate);
      if (result.error) {
        setError(result.error);
        return;
      }
      setConfirming(null);
      load();
    });
  }

  return (
    <div>
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">Cargas anteriores</h2>
      <p className="mb-4 text-sm text-muted">
        Cada carga agrupa todas las filas subidas con la misma fecha de snapshot. Eliminar una carga borra sus
        métricas; los posts que solo existían por esa carga también se eliminan.
      </p>

      {error && <p className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {uploads == null && !error && <p className="text-sm text-muted">Cargando…</p>}

      {uploads && uploads.length === 0 && <p className="text-sm text-muted">Todavía no hay cargas.</p>}

      {uploads && uploads.length > 0 && (
        <ul className="divide-y divide-border rounded border border-border">
          {uploads.map((upload) => (
            <li key={upload.snapshotDate} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
              <span>
                {upload.snapshotDate} <span className="text-muted">· {upload.postCount} posts</span>
              </span>
              {confirming === upload.snapshotDate ? (
                <span className="flex items-center gap-2">
                  <span className="text-muted">¿Eliminar esta carga?</span>
                  <button
                    onClick={() => handleDelete(upload.snapshotDate)}
                    disabled={pending}
                    className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
                  >
                    Sí, eliminar
                  </button>
                  <button onClick={() => setConfirming(null)} disabled={pending} className="text-xs text-muted underline">
                    Cancelar
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => setConfirming(upload.snapshotDate)}
                  disabled={pending}
                  className="text-xs text-red-600 underline disabled:opacity-50"
                >
                  Eliminar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
