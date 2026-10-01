"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updatePost } from "./actions";
import type { Category } from "@/lib/categories";
import type { MetricSnapshot, Post } from "@/lib/supabase/types";

function fractionToPercentInput(value: number | null): string {
  return value == null ? "" : String(Math.round(value * 1000) / 10);
}

export function EditPostForm({
  post,
  snapshot,
  categories,
}: {
  post: Post;
  snapshot: MetricSnapshot | null;
  categories: Category[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const [title, setTitle] = useState(post.title);
  const [author, setAuthor] = useState(post.author ?? "");
  const [postType, setPostType] = useState(post.post_type ?? "");
  const [extraPostTypes, setExtraPostTypes] = useState<string[]>(post.extra_post_types ?? []);
  const [publishedAt, setPublishedAt] = useState(post.published_at ?? "");
  const [views, setViews] = useState(snapshot?.views?.toString() ?? "");
  const [newSubscribers, setNewSubscribers] = useState(snapshot?.new_subscribers?.toString() ?? "");
  const [openRate, setOpenRate] = useState(fractionToPercentInput(snapshot?.open_rate ?? null));
  const [clickToOpenRate, setClickToOpenRate] = useState(fractionToPercentInput(snapshot?.click_to_open_rate ?? null));
  const [engagement, setEngagement] = useState(fractionToPercentInput(snapshot?.engagement ?? null));
  const [estimatedValue, setEstimatedValue] = useState(snapshot?.estimated_value?.toString() ?? "");

  function toggleExtraPostType(name: string) {
    setExtraPostTypes((prev) => (prev.includes(name) ? prev.filter((t) => t !== name) : [...prev, name]));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);
    startTransition(async () => {
      const result = await updatePost({
        postId: post.id,
        slug: post.slug,
        snapshotId: snapshot?.id ?? null,
        title,
        author,
        postType,
        extraPostTypes,
        publishedAt,
        views,
        newSubscribers,
        openRate,
        clickToOpenRate,
        engagement,
        estimatedValue,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setDone(true);
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <div className="mt-4 flex items-center gap-3">
        <button onClick={() => setOpen(true)} className="btn-secondary text-xs">
          Corregir datos
        </button>
        {done && <span className="text-xs text-ink-muted">Guardado.</span>}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="panel mt-6 space-y-5 px-6 py-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Corregir datos del post</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-ink-muted">Título</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="mt-1 w-full rounded-full border border-line bg-white/50 px-4 py-2 outline-none focus:border-blue"
          />
        </label>
        <label className="block text-sm">
          <span className="text-ink-muted">Autor / subtítulo</span>
          <input
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            className="mt-1 w-full rounded-full border border-line bg-white/50 px-4 py-2 outline-none focus:border-blue"
          />
        </label>
        <label className="block text-sm">
          <span className="text-ink-muted">Categoría principal</span>
          <select
            value={postType}
            onChange={(e) => setPostType(e.target.value)}
            className="mt-1 w-full rounded-full border border-line bg-white/50 px-4 py-2 outline-none focus:border-blue"
          >
            <option value="">— sin categoría —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
            {/* Si el post trae un valor de texto libre viejo que no matchea
                ninguna categoría (ej. un post_type de un CSV antiguo), se
                muestra igual para no perderlo silenciosamente al guardar. */}
            {postType && !categories.some((c) => c.name === postType) && (
              <option value={postType}>{postType} (sin categoría registrada)</option>
            )}
          </select>
        </label>
        <fieldset className="block text-sm sm:col-span-2">
          <legend className="text-ink-muted">Categorías adicionales</legend>
          <p className="mt-0.5 text-xs text-ink-muted">
            Para un post que cuenta en más de una sección (ej. un Poema que también salió en El Creativo). Las
            cargas semanales solo actualizan la principal: estas se mantienen.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {categories
              .filter((c) => c.name !== postType)
              .map((c) => {
                const checked = extraPostTypes.includes(c.name);
                return (
                  <label
                    key={c.id}
                    className="chip cursor-pointer"
                    data-tone="type"
                    data-active={checked}
                    style={{ "--chip-color": c.color } as React.CSSProperties}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleExtraPostType(c.name)}
                      className="sr-only"
                    />
                    <span className="chip__dot" aria-hidden />
                    {c.name}
                  </label>
                );
              })}
            {/* Igual que en la principal: un valor viejo que ya no matchea
                ninguna categoría se muestra para poder quitarlo. */}
            {extraPostTypes
              .filter((t) => !categories.some((c) => c.name === t))
              .map((t) => (
                <label key={t} className="chip cursor-pointer" data-active="true">
                  <input type="checkbox" checked onChange={() => toggleExtraPostType(t)} className="sr-only" />
                  {t} (sin categoría registrada)
                </label>
              ))}
          </div>
        </fieldset>
        <label className="block text-sm">
          <span className="text-ink-muted">Fecha de publicación</span>
          <input
            type="date"
            value={publishedAt}
            onChange={(e) => setPublishedAt(e.target.value)}
            className="mt-1 w-full rounded-full border border-line bg-white/50 px-4 py-2 outline-none focus:border-blue"
          />
        </label>
      </div>

      {snapshot ? (
        <div>
          <p className="mb-3 text-sm text-ink-muted">
            Métricas del snapshot más reciente ({snapshot.snapshot_date}).
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block text-sm">
              <span className="text-ink-muted">Views</span>
              <input
                type="number"
                value={views}
                onChange={(e) => setViews(e.target.value)}
                className="mt-1 w-full rounded-full border border-line bg-white/50 px-4 py-2 outline-none focus:border-blue"
              />
            </label>
            <label className="block text-sm">
              <span className="text-ink-muted">Nuevos suscriptores</span>
              <input
                type="number"
                value={newSubscribers}
                onChange={(e) => setNewSubscribers(e.target.value)}
                className="mt-1 w-full rounded-full border border-line bg-white/50 px-4 py-2 outline-none focus:border-blue"
              />
            </label>
            <label className="block text-sm">
              <span className="text-ink-muted">Open rate (%)</span>
              <input
                type="number"
                step="0.1"
                value={openRate}
                onChange={(e) => setOpenRate(e.target.value)}
                className="mt-1 w-full rounded-full border border-line bg-white/50 px-4 py-2 outline-none focus:border-blue"
              />
            </label>
            <label className="block text-sm">
              <span className="text-ink-muted">Click-to-open rate (%)</span>
              <input
                type="number"
                step="0.1"
                value={clickToOpenRate}
                onChange={(e) => setClickToOpenRate(e.target.value)}
                className="mt-1 w-full rounded-full border border-line bg-white/50 px-4 py-2 outline-none focus:border-blue"
              />
            </label>
            <label className="block text-sm">
              <span className="text-ink-muted">Engagement (%)</span>
              <input
                type="number"
                step="0.1"
                value={engagement}
                onChange={(e) => setEngagement(e.target.value)}
                className="mt-1 w-full rounded-full border border-line bg-white/50 px-4 py-2 outline-none focus:border-blue"
              />
            </label>
            <label className="block text-sm">
              <span className="text-ink-muted">Ingresos estimados (USD)</span>
              <input
                type="number"
                step="0.01"
                value={estimatedValue}
                onChange={(e) => setEstimatedValue(e.target.value)}
                className="mt-1 w-full rounded-full border border-line bg-white/50 px-4 py-2 outline-none focus:border-blue"
              />
            </label>
          </div>
        </div>
      ) : (
        <p className="text-sm text-ink-muted">Este post todavía no tiene snapshots de métricas.</p>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-4">
        <button type="submit" disabled={pending} className="btn-primary text-sm">
          {pending ? "Guardando…" : "Guardar cambios"}
        </button>
        <button type="button" onClick={() => setOpen(false)} disabled={pending} className="text-sm text-ink-muted underline">
          Cancelar
        </button>
      </div>
    </form>
  );
}
