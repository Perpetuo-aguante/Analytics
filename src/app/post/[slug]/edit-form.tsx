"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updatePost } from "./actions";
import { LEADERBOARD_POST_TYPES } from "@/lib/post-types";
import type { MetricSnapshot, Post } from "@/lib/supabase/types";

function fractionToPercentInput(value: number | null): string {
  return value == null ? "" : String(Math.round(value * 1000) / 10);
}

export function EditPostForm({ post, snapshot }: { post: Post; snapshot: MetricSnapshot | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const [title, setTitle] = useState(post.title);
  const [author, setAuthor] = useState(post.author ?? "");
  const [postType, setPostType] = useState(post.post_type ?? "");
  const [publishedAt, setPublishedAt] = useState(post.published_at ?? "");
  const [views, setViews] = useState(snapshot?.views?.toString() ?? "");
  const [newSubscribers, setNewSubscribers] = useState(snapshot?.new_subscribers?.toString() ?? "");
  const [openRate, setOpenRate] = useState(fractionToPercentInput(snapshot?.open_rate ?? null));
  const [clickToOpenRate, setClickToOpenRate] = useState(fractionToPercentInput(snapshot?.click_to_open_rate ?? null));
  const [engagement, setEngagement] = useState(fractionToPercentInput(snapshot?.engagement ?? null));

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
        publishedAt,
        views,
        newSubscribers,
        openRate,
        clickToOpenRate,
        engagement,
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
        {done && <span className="text-xs text-muted">Guardado.</span>}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-5 rounded-2xl border border-border px-6 py-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Corregir datos del post</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-muted">Título</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="mt-1 w-full rounded-full border border-border bg-white/50 px-4 py-2 outline-none focus:border-accent"
          />
        </label>
        <label className="block text-sm">
          <span className="text-muted">Autor / subtítulo</span>
          <input
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            className="mt-1 w-full rounded-full border border-border bg-white/50 px-4 py-2 outline-none focus:border-accent"
          />
        </label>
        <label className="block text-sm">
          <span className="text-muted">Tipo de post</span>
          <input
            value={postType}
            onChange={(e) => setPostType(e.target.value)}
            list="post-type-options"
            className="mt-1 w-full rounded-full border border-border bg-white/50 px-4 py-2 outline-none focus:border-accent"
          />
          <datalist id="post-type-options">
            {LEADERBOARD_POST_TYPES.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </label>
        <label className="block text-sm">
          <span className="text-muted">Fecha de publicación</span>
          <input
            type="date"
            value={publishedAt}
            onChange={(e) => setPublishedAt(e.target.value)}
            className="mt-1 w-full rounded-full border border-border bg-white/50 px-4 py-2 outline-none focus:border-accent"
          />
        </label>
      </div>

      {snapshot ? (
        <div>
          <p className="mb-3 text-sm text-muted">
            Métricas del snapshot más reciente ({snapshot.snapshot_date}).
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block text-sm">
              <span className="text-muted">Views</span>
              <input
                type="number"
                value={views}
                onChange={(e) => setViews(e.target.value)}
                className="mt-1 w-full rounded-full border border-border bg-white/50 px-4 py-2 outline-none focus:border-accent"
              />
            </label>
            <label className="block text-sm">
              <span className="text-muted">Nuevos suscriptores</span>
              <input
                type="number"
                value={newSubscribers}
                onChange={(e) => setNewSubscribers(e.target.value)}
                className="mt-1 w-full rounded-full border border-border bg-white/50 px-4 py-2 outline-none focus:border-accent"
              />
            </label>
            <label className="block text-sm">
              <span className="text-muted">Open rate (%)</span>
              <input
                type="number"
                step="0.1"
                value={openRate}
                onChange={(e) => setOpenRate(e.target.value)}
                className="mt-1 w-full rounded-full border border-border bg-white/50 px-4 py-2 outline-none focus:border-accent"
              />
            </label>
            <label className="block text-sm">
              <span className="text-muted">Click-to-open rate (%)</span>
              <input
                type="number"
                step="0.1"
                value={clickToOpenRate}
                onChange={(e) => setClickToOpenRate(e.target.value)}
                className="mt-1 w-full rounded-full border border-border bg-white/50 px-4 py-2 outline-none focus:border-accent"
              />
            </label>
            <label className="block text-sm">
              <span className="text-muted">Engagement (%)</span>
              <input
                type="number"
                step="0.1"
                value={engagement}
                onChange={(e) => setEngagement(e.target.value)}
                className="mt-1 w-full rounded-full border border-border bg-white/50 px-4 py-2 outline-none focus:border-accent"
              />
            </label>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted">Este post todavía no tiene snapshots de métricas.</p>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-4">
        <button type="submit" disabled={pending} className="btn-primary text-sm">
          {pending ? "Guardando…" : "Guardar cambios"}
        </button>
        <button type="button" onClick={() => setOpen(false)} disabled={pending} className="text-sm text-muted underline">
          Cancelar
        </button>
      </div>
    </form>
  );
}
