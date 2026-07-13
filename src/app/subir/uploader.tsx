"use client";

import { useMemo, useState, useTransition } from "react";
import {
  FIELD_LABELS,
  FIELD_ORDER,
  REQUIRED_FIELDS,
  type FieldKey,
} from "@/lib/columns";
import { cellToString, parseDateValue, parseIntValue, parseRateValue } from "@/lib/format";
import { commitImport, parseFile, type ImportSummary, type ParsePreview } from "./actions";

type Mapping = Record<FieldKey, string | null>;

const NONE = "__none__";

export function Uploader() {
  const [preview, setPreview] = useState<ParsePreview | null>(null);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [snapshotDate, setSnapshotDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const missingRequired = useMemo(
    () => (mapping ? REQUIRED_FIELDS.filter((field) => !mapping[field]) : []),
    [mapping]
  );

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // permite volver a elegir el mismo archivo si hay que corregirlo
    if (!file) return;
    setError(null);
    setSummary(null);
    setPreview(null);
    setMapping(null);
    const formData = new FormData();
    formData.set("file", file);
    startTransition(async () => {
      const result = await parseFile(formData);
      if (result.error || !result.data) {
        setError(result.error ?? "No se pudo leer el archivo.");
        return;
      }
      setPreview(result.data);
      setMapping(result.data.suggestedMapping);
    });
  }

  function handleMappingChange(field: FieldKey, header: string) {
    setMapping((prev) => (prev ? { ...prev, [field]: header === NONE ? null : header } : prev));
  }

  function handleConfirm() {
    if (!preview || !mapping) return;
    startTransition(async () => {
      const result = await commitImport({ rows: preview.rows, mapping, snapshotDate });
      if (result.error || !result.data) {
        setError(result.error ?? "No se pudo importar el archivo.");
        return;
      }
      setSummary(result.data);
      setPreview(null);
      setMapping(null);
    });
  }

  function handleReset() {
    setSummary(null);
    setError(null);
    setPreview(null);
    setMapping(null);
  }

  return (
    <div className="space-y-8">
      {!preview && !summary && (
        <div>
          <label className="block cursor-pointer rounded border border-dashed border-border px-6 py-10 text-center text-sm text-muted hover:border-foreground">
            {pending ? "Leyendo archivo…" : "Elige un archivo .xlsx o .csv"}
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

      {preview && mapping && (
        <div className="space-y-8">
          <div>
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">
              1. Revisa el mapeo de columnas
            </h2>
            <p className="mb-4 text-sm text-muted">
              Detectamos {preview.rowCount} filas. Confirma qué columna del archivo corresponde a cada campo.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {FIELD_ORDER.map((field) => {
                const required = REQUIRED_FIELDS.includes(field);
                const unresolved = required && !mapping[field];
                return (
                  <label key={field} className="block text-sm">
                    <span className={unresolved ? "text-red-600" : "text-muted"}>
                      {FIELD_LABELS[field]}
                      {required ? " *" : ""}
                    </span>
                    <select
                      value={mapping[field] ?? NONE}
                      onChange={(e) => handleMappingChange(field, e.target.value)}
                      className={`mt-1 w-full rounded border bg-transparent px-3 py-2 ${
                        unresolved ? "border-red-400" : "border-border"
                      }`}
                    >
                      <option value={NONE}>— no aplica —</option>
                      {preview.headers.map((header) => (
                        <option key={header} value={header}>
                          {header}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">
              2. Fecha de este snapshot
            </h2>
            <p className="mb-3 text-sm text-muted">
              Se guarda igual para todas las filas de esta carga (normalmente, hoy).
            </p>
            <input
              type="date"
              value={snapshotDate}
              onChange={(e) => setSnapshotDate(e.target.value)}
              className="rounded border border-border bg-transparent px-3 py-2 text-sm"
            />
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
              3. Vista previa (primeras 5 filas)
            </h2>
            <PreviewTable rows={preview.rows.slice(0, 5)} mapping={mapping} />
          </div>

          {missingRequired.length > 0 && (
            <p className="text-sm text-red-600">
              Falta mapear: {missingRequired.map((f) => FIELD_LABELS[f]).join(", ")}.
            </p>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleConfirm}
              disabled={pending || missingRequired.length > 0}
              className="rounded bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
            >
              {pending ? "Importando…" : "Confirmar e importar"}
            </button>
            <button onClick={handleReset} disabled={pending} className="text-sm text-muted underline">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {summary && (
        <div className="space-y-4 rounded border border-border px-6 py-6">
          <p className="text-sm">
            Listo. {summary.postsCreados} posts nuevos, {summary.postsActualizados} actualizados,{" "}
            {summary.snapshots} snapshots guardados.
          </p>
          <button onClick={handleReset} className="text-sm underline">
            Cargar otro archivo
          </button>
        </div>
      )}
    </div>
  );
}

function PreviewTable({ rows, mapping }: { rows: Record<string, unknown>[]; mapping: Mapping }) {
  const displayFields = FIELD_ORDER.filter((f) => mapping[f]);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[600px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted">
            {displayFields.map((field) => (
              <th key={field} className="whitespace-nowrap px-2 py-2 font-medium">
                {FIELD_LABELS[field]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border/60">
              {displayFields.map((field) => (
                <td key={field} className="whitespace-nowrap px-2 py-2">
                  {formatPreviewCell(field, row[mapping[field] as string])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatPreviewCell(field: FieldKey, value: unknown): string {
  switch (field) {
    case "published_at":
      return parseDateValue(value) ?? "—";
    case "views":
    case "new_subscribers":
      return parseIntValue(value)?.toLocaleString("es") ?? "—";
    case "open_rate":
    case "click_to_open_rate":
    case "engagement": {
      const rate = parseRateValue(value);
      return rate == null ? "—" : `${(rate * 100).toFixed(1)}%`;
    }
    default:
      return cellToString(value) ?? "—";
  }
}
