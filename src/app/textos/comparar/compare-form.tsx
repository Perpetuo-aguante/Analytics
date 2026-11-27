"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { TextMap, type TextMapDatum } from "@/components/text-map";
import type { Category } from "@/lib/categories";
import type { DraftComparison } from "@/lib/texts";
import { compareText } from "./actions";

export function CompareForm({ points, categories }: { points: TextMapDatum[]; categories: Category[] }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<DraftComparison | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function loadFile(file: File | undefined) {
    if (file) setText(await file.text());
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await compareText(text);
      if (res.error !== null) {
        setError(res.error);
        setResult(null);
      } else {
        setResult(res.comparison);
      }
    });
  }

  const estimate = result?.estimatedCompass ?? null;

  return (
    <div className="space-y-6">
      <section className="panel p-5 sm:p-6">
        <label htmlFor="draft" className="text-sm font-medium">
          Texto
        </label>
        <textarea
          id="draft"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          placeholder="Pega aquí el texto completo…"
          className="field mt-2 block w-full font-serif"
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <label className="text-sm text-ink-secondary">
            o sube un .txt:{" "}
            <input type="file" accept=".txt,text/plain" onChange={(e) => loadFile(e.target.files?.[0])} className="text-sm" />
          </label>
          <button type="button" onClick={submit} disabled={pending || !text.trim()} className="btn-primary px-5 py-2 text-sm">
            {pending ? "Comparando…" : "Comparar"}
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      </section>

      {result && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="panel p-5 sm:p-6">
            <h2 className="font-display text-xl font-bold">Dónde caería</h2>
            <p className="mt-1 text-sm text-ink-secondary">
              {result.wordCount.toLocaleString("es")} palabras.{" "}
              {estimate ? (
                <>
                  Promedio del compass de sus {result.estimatedFrom} vecinos más parecidos, ponderado por similitud:{" "}
                  <strong className="tnum">{Math.round(estimate.x)}</strong> en referencial ↔ poético y{" "}
                  <strong className="tnum">{Math.round(estimate.y)}</strong> en impersonal ↔ subjetivo.
                </>
              ) : (
                "Sus vecinos todavía no están analizados: no hay de dónde estimar su lugar en el compass."
              )}
              {result.confidence < 0.12 && <> Se parece poco a todo lo publicado: tómalo con pinzas.</>}
            </p>
            {result.categories.length > 0 && (
              <p className="mt-4 text-sm">
                Se parece más a{" "}
                {result.categories.slice(0, 3).map((c, i, arr) => (
                  <span key={c.category}>
                    {i > 0 && (i === arr.length - 1 ? " y " : ", ")}
                    <strong>{c.category}</strong> ({Math.round(c.share * 100)}%)
                  </span>
                ))}
                .
              </p>
            )}
            {result.keyTerms.length > 0 && <p className="mt-3 text-xs text-ink-muted">Palabras que más lo distinguen: {result.keyTerms.join(", ")}</p>}
          </section>

          <section className="panel p-5 sm:p-6">
            <h2 className="font-display text-xl font-bold">Textos más parecidos</h2>
            <ol className="mt-4 divide-y divide-line text-sm">
              {result.neighbors.map((n) => (
                <li key={n.slug} className="flex items-baseline justify-between gap-4 py-2">
                  <span>
                    <Link href={`/post/${n.slug}`} className="font-medium hover:underline">
                      {n.title}
                    </Link>
                    {n.category && <span className="text-ink-muted"> · {n.category}</span>}
                    {n.sharedTerms.length > 0 && <span className="block text-xs text-ink-muted">comparten: {n.sharedTerms.join(", ")}</span>}
                  </span>
                  <span className="tnum shrink-0 text-xs text-ink-muted">{Math.round(n.similarity * 100)}%</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}

      <section className="panel p-5 sm:p-6">
        <h2 className="font-display text-xl font-bold">El compass</h2>
        {points.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">Todavía no hay posts analizados.</p>
        ) : (
          <div className="mt-4">
            <TextMap
              data={points}
              categories={categories}
              midlines
              highlight={estimate ? { x: estimate.x / 100, y: estimate.y / 100, label: "Borrador (estimado)" } : null}
              x={{ label: "Referencial ↔ Poético", domain: "unit", lowHint: "referencial", highHint: "poético" }}
              y={{ label: "Impersonal ↔ Subjetivo", domain: "unit", lowHint: "impersonal", highHint: "subjetivo" }}
            />
          </div>
        )}
      </section>
    </div>
  );
}
