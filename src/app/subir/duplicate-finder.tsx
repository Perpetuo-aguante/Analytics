"use client";

import { useState, useTransition } from "react";
import { findDuplicateCandidates, mergeDuplicatePosts, type DuplicateCandidate } from "./actions";

export function DuplicateFinder() {
  const [candidates, setCandidates] = useState<DuplicateCandidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [keepChoice, setKeepChoice] = useState<Record<number, "A" | "B">>({});
  const [confirming, setConfirming] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  function scan() {
    startTransition(async () => {
      setError(null);
      const result = await findDuplicateCandidates();
      if (result.error || !result.data) {
        setError(result.error ?? "No se pudo buscar duplicados.");
        return;
      }
      setCandidates(result.data);
      setKeepChoice({});
    });
  }

  function handleMerge(index: number) {
    const candidate = candidates?.[index];
    if (!candidate) return;
    const keep = keepChoice[index] ?? "A";
    const keepPost = keep === "A" ? candidate.postA : candidate.postB;
    const discardPost = keep === "A" ? candidate.postB : candidate.postA;

    startTransition(async () => {
      const result = await mergeDuplicatePosts(keepPost.id, discardPost.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      setConfirming(null);
      setCandidates((prev) => (prev ? prev.filter((_, i) => i !== index) : prev));
    });
  }

  return (
    <div>
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-ink-muted">Posibles posts duplicados</h2>
      <p className="mb-4 text-sm text-ink-muted">
        Compara títulos y slugs por similitud (no por igualdad exacta), porque algunas cargas guardan el slug crudo de
        Substack como título en vez del título real — en ese caso el margen de similitud es más amplio, porque un slug
        crudo puede diferir más del título real que dos títulos legítimamente distintos. Revisa cada par antes de
        combinar — la fusión mueve las métricas históricas al post que elijas conservar y borra el otro.
      </p>

      <button
        type="button"
        onClick={scan}
        disabled={pending}
        className="rounded-full border border-line px-3 py-1.5 text-sm text-ink-muted hover:border-blue hover:text-ink disabled:opacity-50"
      >
        {pending && candidates == null ? "Buscando…" : "Buscar duplicados"}
      </button>

      {error && (
        <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}

      {candidates != null && candidates.length === 0 && (
        <p className="mt-4 text-sm text-ink-muted">No se encontraron posibles duplicados.</p>
      )}

      {candidates != null && candidates.length > 0 && (
        <ul className="mt-4 space-y-3">
          {candidates.map((candidate, index) => {
            const keep = keepChoice[index] ?? "A";
            return (
              <li key={`${candidate.postA.id}-${candidate.postB.id}`} className="panel p-4 text-sm">
                <p className="mb-3 text-xs text-ink-muted">Similitud: {Math.round(candidate.similarity * 100)}%</p>
                <div className="mb-3 space-y-2">
                  {(["A", "B"] as const).map((option) => {
                    const post = option === "A" ? candidate.postA : candidate.postB;
                    return (
                      <label key={option} className="flex items-start gap-2">
                        <input
                          type="radio"
                          name={`keep-${index}`}
                          checked={keep === option}
                          onChange={() => setKeepChoice((prev) => ({ ...prev, [index]: option }))}
                          className="mt-1"
                        />
                        <span>
                          <span className="font-medium">{post.title}</span>{" "}
                          <span className="text-ink-muted">
                            ({post.slug} · {post.publishedAt ?? "sin fecha"})
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                <p className="mb-2 text-xs text-ink-muted">Se conservará el marcado arriba; el otro se elimina.</p>

                {confirming === index ? (
                  <span className="flex items-center gap-2">
                    <span className="text-ink-muted">¿Combinar? Esto no se puede deshacer.</span>
                    <button
                      onClick={() => handleMerge(index)}
                      disabled={pending}
                      className="rounded-full bg-red-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
                    >
                      Sí, combinar
                    </button>
                    <button onClick={() => setConfirming(null)} disabled={pending} className="text-xs text-ink-muted underline">
                      Cancelar
                    </button>
                  </span>
                ) : (
                  <button
                    onClick={() => setConfirming(index)}
                    disabled={pending}
                    className="rounded-full border border-red-200 px-3 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    Combinar
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
