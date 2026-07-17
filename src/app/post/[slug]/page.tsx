import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { getPostBySlug, getSnapshotsForPost } from "@/lib/queries";
import { LineChart, type ChartPoint } from "@/components/line-chart";
import { EditPostForm } from "./edit-form";
import { isValidSessionCookieValue, SESSION_COOKIE_NAME } from "@/lib/session";
import type { MetricSnapshot } from "@/lib/supabase/types";

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) notFound();

  const [snapshots, cookieStore] = await Promise.all([getSnapshotsForPost(post.id), cookies()]);
  const isAdmin = isValidSessionCookieValue(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  const latestSnapshot = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
      <Link href="/" className="text-sm text-muted hover:underline">
        ← Volver
      </Link>
      <h1 className="mt-4 font-serif text-3xl font-semibold">{post.title}</h1>
      {post.author && <p className="mt-1 text-sm text-muted">{post.author}</p>}
      <p className="mt-2 text-sm text-muted">
        {post.topic ?? "—"} · {post.post_type ?? "—"} · {post.published_at ?? "sin fecha"}
        {post.url && (
          <>
            {" · "}
            <a href={post.url} target="_blank" rel="noreferrer" className="underline">
              ver en Substack
            </a>
          </>
        )}
      </p>

      {isAdmin && <EditPostForm post={post} snapshot={latestSnapshot} />}

      {snapshots.length === 0 ? (
        <p className="mt-12 text-sm text-muted">Todavía no hay snapshots de métricas para este post.</p>
      ) : (
        <div className="mt-12 space-y-12">
          <ChartBlock title="Views" snapshots={snapshots} field="views" />
          <ChartBlock title="Nuevos suscriptores" snapshots={snapshots} field="new_subscribers" />
          <ChartBlock title="Engagement" snapshots={snapshots} field="engagement" percent />
          <ChartBlock title="Open rate" snapshots={snapshots} field="open_rate" percent />
          <ChartBlock title="Click-to-open rate" snapshots={snapshots} field="click_to_open_rate" percent />
        </div>
      )}
    </main>
  );
}

function ChartBlock({
  title,
  snapshots,
  field,
  percent,
}: {
  title: string;
  snapshots: MetricSnapshot[];
  field: keyof MetricSnapshot;
  percent?: boolean;
}) {
  const points: ChartPoint[] = snapshots.map((s) => ({
    date: s.snapshot_date,
    value: s[field] as number | null,
  }));
  const hasData = points.some((p) => p.value != null);

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
      {hasData ? <LineChart points={points} percent={percent} /> : <p className="text-sm text-muted">Sin datos.</p>}
    </section>
  );
}
