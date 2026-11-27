import Link from "next/link";
import { notFound } from "next/navigation";
import { getPostBySlug, getSnapshotsForPost } from "@/lib/queries";
import { getCategories } from "@/lib/categories";
import { matchPostCategories } from "@/lib/post-types";
import { LineChart, type ChartPoint } from "@/components/line-chart";
import { InterestChart } from "@/components/interest-chart";
import { interestIntervals, summarizePeaks } from "@/lib/interest";
import { EditPostForm } from "./edit-form";
import { TextSection } from "./text-section";
import { isAdmin as getIsAdmin } from "@/lib/session";
import type { MetricSnapshot } from "@/lib/db-types";

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) notFound();

  const [snapshots, isAdmin, categories] = await Promise.all([
    getSnapshotsForPost(post.id),
    getIsAdmin(),
    getCategories(),
  ]);
  const latestSnapshot = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
  const intervals = interestIntervals(snapshots, post.published_at);
  const peaks = summarizePeaks(intervals, post.published_at);
  const postCategories = matchPostCategories(post.post_type, post.extra_post_types, categories);
  const categoryLabel =
    postCategories.length > 0 ? postCategories.map((c) => c.name).join(", ") : (post.post_type ?? "—");

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <Link href="/" className="text-sm text-ink-muted hover:underline">
        ← Volver
      </Link>
      <h1 className="mt-4 display-title text-4xl sm:text-5xl">{post.title}</h1>
      {post.author && <p className="mt-1 text-sm text-ink-muted">{post.author}</p>}
      <p className="mt-2 text-sm text-ink-muted">
        {post.topic ?? "—"} · {categoryLabel} · {post.published_at ?? "sin fecha"}
        {post.url && (
          <>
            {" · "}
            <a href={post.url} target="_blank" rel="noreferrer" className="underline">
              ver en Substack
            </a>
          </>
        )}
      </p>

      {isAdmin && <EditPostForm post={post} snapshot={latestSnapshot} categories={categories} />}

      <TextSection postId={post.id} slug={post.slug} isAdmin={isAdmin} />

      {snapshots.length === 0 ? (
        <p className="mt-12 text-sm text-ink-muted">Todavía no hay snapshots de métricas para este post.</p>
      ) : (
        <div className="mt-12 space-y-12">
          <section>
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-ink-muted">
              Interés a lo largo del tiempo
            </h2>
            <p className="mb-3 text-sm text-ink-secondary">
              Vistas nuevas por día entre una carga y la siguiente.{" "}
              {peaks.peak && (
                <>
                  El pico fue de <strong>{formatRate(peaks.peak.perDay)} vistas/día</strong> (
                  {peaks.peak.start} → {peaks.peak.end}
                  {peaks.peak.launch ? ", en el lanzamiento" : ""}).{" "}
                </>
              )}
              {peaks.baselinePerDay != null && <>Su ritmo habitual pasado el lanzamiento: {formatRate(peaks.baselinePerDay)}/día. </>}
              {peaks.resurgences.length > 0 && (
                <>
                  Tuvo {peaks.resurgences.length === 1 ? "un repunte" : `${peaks.resurgences.length} repuntes`} de
                  interés después del lanzamiento: el tema volvió a circular.
                </>
              )}
            </p>
            {intervals.length > 0 ? (
              <InterestChart intervals={intervals} peak={peaks.peak} resurgences={peaks.resurgences} />
            ) : (
              <p className="text-sm text-ink-muted">Hacen falta al menos dos cargas (o la fecha de publicación y una carga).</p>
            )}
          </section>
          <ChartBlock title="Views acumuladas" snapshots={snapshots} field="views" />
          <ChartBlock title="Nuevos suscriptores" snapshots={snapshots} field="new_subscribers" />
          <ChartBlock title="Engagement" snapshots={snapshots} field="engagement" percent />
          <ChartBlock title="Open rate" snapshots={snapshots} field="open_rate" percent />
          <ChartBlock title="Click-to-open rate" snapshots={snapshots} field="click_to_open_rate" percent />
          <ChartBlock title="Ingresos estimados" snapshots={snapshots} field="estimated_value" money />
        </div>
      )}
    </main>
  );
}

function formatRate(v: number): string {
  return v >= 10 ? Math.round(v).toLocaleString("es") : v.toFixed(1);
}

function ChartBlock({
  title,
  snapshots,
  field,
  percent,
  money,
}: {
  title: string;
  snapshots: MetricSnapshot[];
  field: keyof MetricSnapshot;
  percent?: boolean;
  money?: boolean;
}) {
  const points: ChartPoint[] = snapshots.map((s) => ({
    date: s.snapshot_date,
    value: s[field] as number | null,
  }));
  const hasData = points.some((p) => p.value != null);

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted">{title}</h2>
      {hasData ? <LineChart points={points} percent={percent} money={money} /> : <p className="text-sm text-ink-muted">Sin datos.</p>}
    </section>
  );
}
