"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ReadingBars } from "@/components/reading-bars";
import { TextMap, type AxisSpec, type TextMapDatum } from "@/components/text-map";
import type { Category } from "@/lib/categories";
import { READING_KEYS, READING_LABELS, type Reading, type ReadingKey } from "@/lib/text-analysis";
import type { DraftComparison } from "@/lib/texts";
import { compareText } from "./actions";

export type CorpusPoint = {
  id: string;
  slug: string;
  title: string;
  category: Category;
  lexico: [number, number] | null;
  reading: Reading | null;
};

type AxisKey = "lexico1" | "lexico2" | ReadingKey;
const AXIS_KEYS: AxisKey[] = ["lexico1", "lexico2", ...READING_KEYS];
type AxisInfo = { low: string; high: string; explained: number };

function label(key: AxisKey): string {
  if (key === "lexico1") return "Eje léxico 1";
  if (key === "lexico2") return "Eje léxico 2";
  return READING_LABELS[key];
}

function spec(key: AxisKey, axes: AxisInfo[] | null): AxisSpec {
  if (key === "lexico1" || key === "lexico2") {
    const axis = axes?.[key === "lexico1" ? 0 : 1];
    return { label: label(key), domain: "free", lowHint: axis?.low, highHint: axis?.high };
  }
  return { label: label(key), domain: key === "sentimiento" ? "signed" : "unit" };
}

function value(key: AxisKey, lexico: [number, number] | null, reading: Reading | null): number | null {
  if (key === "lexico1") return lexico?.[0] ?? null;
  if (key === "lexico2") return lexico?.[1] ?? null;
  return reading?.[key] ?? null;
}

export function CompareForm({
  points,
  categories,
  axes,
}: {
  points: CorpusPoint[];
  categories: Category[];
  axes: AxisInfo[] | null;
}) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<DraftComparison | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [xKey, setXKey] = useState<AxisKey>("lexico1");
  const [yKey, setYKey] = useState<AxisKey>("lexico2");

  async function loadFile(file: File | undefined) {
    if (!file) return;
    setText(await file.text());
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

  const data: TextMapDatum[] = [];
  for (const p of points) {
    const x = value(xKey, p.lexico, p.reading);
    const y = value(yKey, p.lexico, p.reading);
    if (x != null && y != null) data.push({ id: p.id, slug: p.slug, title: p.title, category: p.category, x, y });
  }
  const hx = result ? value(xKey, result.mapPoint, result.predicted) : null;
  const hy = result ? value(yKey, result.mapPoint, result.predicted) : null;
  const highlight = hx != null && hy != null ? { x: hx, y: hy, label: "Texto nuevo" } : null;

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
            <h2 className="font-display text-lg font-semibold">Lectura estimada</h2>
            <p className="mb-4 mt-1 text-sm text-ink-secondary">
              {result.wordCount.toLocaleString("es")} palabras. Promedio de la lectura de sus{" "}
              {result.predictedFrom} vecinos más parecidos, ponderado por similitud
              {result.confidence < 0.12 && (
                <> — <strong>se parece poco a todo lo publicado</strong>, así que tómala con pinzas</>
              )}
              .
            </p>
            {result.predictedFrom > 0 ? (
              <ReadingBars reading={result.predicted} estimated />
            ) : (
              <p className="text-sm text-ink-muted">Sus vecinos todavía no tienen lectura de estilo: no hay de dónde estimarla.</p>
            )}
            {result.categories.length > 0 && (
              <p className="mt-5 text-sm">
                Se parece más a{" "}
                {result.categories.slice(0, 3).map((c, i) => (
                  <span key={c.category}>
                    {i > 0 && (i === Math.min(result.categories.length, 3) - 1 ? " y " : ", ")}
                    <strong>{c.category}</strong> ({Math.round(c.share * 100)}%)
                  </span>
                ))}
                .
              </p>
            )}
            {result.keyTerms.length > 0 && (
              <p className="mt-3 text-xs text-ink-muted">Palabras que más lo distinguen: {result.keyTerms.join(", ")}</p>
            )}
          </section>

          <section className="panel p-5 sm:p-6">
            <h2 className="font-display text-lg font-semibold">Textos más parecidos</h2>
            <ol className="mt-4 divide-y divide-line text-sm">
              {result.neighbors.map((n) => (
                <li key={n.slug} className="flex items-baseline justify-between gap-4 py-2">
                  <span>
                    <Link href={`/post/${n.slug}`} className="font-medium hover:underline">
                      {n.title}
                    </Link>
                    {n.category && <span className="text-ink-muted"> · {n.category}</span>}
                    {n.sharedTerms.length > 0 && (
                      <span className="block text-xs text-ink-muted">comparten: {n.sharedTerms.join(", ")}</span>
                    )}
                  </span>
                  <span className="tnum shrink-0 text-xs text-ink-muted">{Math.round(n.similarity * 100)}%</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}

      <section className="panel p-5 sm:p-6">
        <h2 className="font-display text-lg font-semibold">Dónde cae en el mapa</h2>
        <p className="mb-4 mt-1 text-sm text-ink-secondary">
          En el mapa léxico, la posición del texto nuevo se calcula con sus palabras; en los ejes de estilo y
          sentimiento, con su lectura estimada.
        </p>
        <div className="mb-5 flex flex-wrap gap-3 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-ink-muted">Eje horizontal</span>
            <select value={xKey} onChange={(e) => setXKey(e.target.value as AxisKey)} className="field">
              {AXIS_KEYS.map((k) => (
                <option key={k} value={k}>
                  {label(k)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-ink-muted">Eje vertical</span>
            <select value={yKey} onChange={(e) => setYKey(e.target.value as AxisKey)} className="field">
              {AXIS_KEYS.map((k) => (
                <option key={k} value={k}>
                  {label(k)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {data.length === 0 ? (
          <p className="text-sm text-ink-muted">Todavía no hay textos con datos para estos ejes.</p>
        ) : (
          <TextMap data={data} categories={categories} x={spec(xKey, axes)} y={spec(yKey, axes)} highlight={highlight} />
        )}
      </section>
    </div>
  );
}
