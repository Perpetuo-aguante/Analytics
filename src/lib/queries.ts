import { createAnonClient } from "./supabase/server";
import type { CurrentMetric, MetricSnapshot, Post } from "./supabase/types";
import { LEADERBOARD_POST_TYPES, NEWSLETTER_POST_TYPES, matchPostType, type LeaderboardPostType } from "./post-types";

export type CurrentMetricFilters = {
  q?: string;
  topic?: string;
  postType?: string;
  // Rango de fecha de publicación (YYYY-MM-DD). Filtrar por fecha excluye
  // posts sin published_at.
  publishedFrom?: string;
  publishedTo?: string;
  // Mínimo de nuevos suscriptores en el snapshot más reciente.
  minSubscribers?: number;
};

export async function getCurrentMetrics(filters: CurrentMetricFilters = {}): Promise<CurrentMetric[]> {
  const supabase = createAnonClient();
  let query = supabase.from("current_metrics").select("*");
  if (filters.q) query = query.ilike("title", `%${filters.q}%`);
  if (filters.topic) query = query.eq("topic", filters.topic);
  if (filters.postType) query = query.eq("post_type", filters.postType);
  if (filters.publishedFrom) query = query.gte("published_at", filters.publishedFrom);
  if (filters.publishedTo) query = query.lte("published_at", filters.publishedTo);
  if (filters.minSubscribers != null) query = query.gte("new_subscribers", filters.minSubscribers);

  const { data, error } = await query.order("snapshot_date", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as CurrentMetric[];
}

export async function getFilterOptions(): Promise<{ topics: string[]; postTypes: string[] }> {
  const supabase = createAnonClient();
  const { data, error } = await supabase.from("posts").select("topic, post_type");
  if (error) throw new Error(error.message);

  const topics = new Set<string>();
  const postTypes = new Set<string>();
  for (const row of data ?? []) {
    if (row.topic) topics.add(row.topic);
    if (row.post_type) postTypes.add(row.post_type);
  }
  return { topics: Array.from(topics).sort(), postTypes: Array.from(postTypes).sort() };
}

// limit: cuántos posts devolver por métrica. null = todos (sin recortar).
export async function getLeaderboards(limit: number | null = 10): Promise<{
  bySubscribers: CurrentMetric[];
  byViews: CurrentMetric[];
  byEngagement: CurrentMetric[];
}> {
  const supabase = createAnonClient();
  const { data, error } = await supabase.from("current_metrics").select("*");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as CurrentMetric[];

  const top = (key: keyof CurrentMetric) => {
    const sorted = [...rows]
      .filter((r) => r[key] != null)
      .sort((a, b) => (b[key] as number) - (a[key] as number));
    return limit == null ? sorted : sorted.slice(0, limit);
  };

  return {
    bySubscribers: top("new_subscribers"),
    byViews: top("views"),
    byEngagement: top("engagement"),
  };
}

// Leaderboard agrupado por tipo de post (Ensayo, Cuento, Poema, etc.),
// ordenado por views dentro de cada grupo. limit: cuántos posts por grupo;
// null = todos.
export async function getLeaderboardsByType(
  limit: number | null = 5
): Promise<Record<LeaderboardPostType, CurrentMetric[]>> {
  const supabase = createAnonClient();
  const { data, error } = await supabase.from("current_metrics").select("*");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as CurrentMetric[];

  const grouped = new Map<LeaderboardPostType, CurrentMetric[]>(
    LEADERBOARD_POST_TYPES.map((type) => [type, []])
  );
  for (const row of rows) {
    const type = matchPostType(row.post_type);
    if (type) grouped.get(type)!.push(row);
  }

  const result = {} as Record<LeaderboardPostType, CurrentMetric[]>;
  for (const type of LEADERBOARD_POST_TYPES) {
    const sorted = (grouped.get(type) ?? [])
      .filter((r) => r.views != null)
      .sort((a, b) => (b.views as number) - (a.views as number));
    result[type] = limit == null ? sorted : sorted.slice(0, limit);
  }
  return result;
}

export async function getPostBySlug(slug: string): Promise<Post | null> {
  const supabase = createAnonClient();
  const { data, error } = await supabase.from("posts").select("*").eq("slug", slug).maybeSingle();
  if (error) throw new Error(error.message);
  return data as Post | null;
}

// Punto de un scatter: el snapshot más reciente de cada post, con su tipo
// canónico ya resuelto (se descartan posts cuyo tipo no matchea ninguno de
// los canónicos, para que el color/forma asignados sean siempre válidos).
export type ScatterMetric = {
  postId: string;
  slug: string;
  title: string;
  postType: LeaderboardPostType;
  views: number | null;
  newSubscribers: number | null;
  engagement: number | null;
};

export async function getScatterMetrics(): Promise<ScatterMetric[]> {
  const supabase = createAnonClient();
  const { data, error } = await supabase.from("current_metrics").select("*");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as CurrentMetric[];

  const result: ScatterMetric[] = [];
  for (const row of rows) {
    const postType = matchPostType(row.post_type);
    if (!postType) continue;
    result.push({
      postId: row.post_id,
      slug: row.slug,
      title: row.title,
      postType,
      views: row.views,
      newSubscribers: row.new_subscribers,
      engagement: row.engagement,
    });
  }
  return result;
}

export type SectionTimelinePoint = { date: string; openRate: number | null; views: number | null };

// Serie histórica por sección (solo los tipos que se envían por newsletter):
// open rate promedio y views acumuladas (suma), agrupadas por la fecha de
// carga semanal (snapshot_date es compartida por todos los posts de una
// misma carga, ver schema.sql).
export async function getSectionTimelines(): Promise<
  { postType: (typeof NEWSLETTER_POST_TYPES)[number]; points: SectionTimelinePoint[] }[]
> {
  const supabase = createAnonClient();
  const [postsRes, snapshotsRes] = await Promise.all([
    supabase.from("posts").select("id, post_type"),
    supabase.from("metric_snapshots").select("post_id, snapshot_date, views, open_rate"),
  ]);
  if (postsRes.error) throw new Error(postsRes.error.message);
  if (snapshotsRes.error) throw new Error(snapshotsRes.error.message);

  const typeByPostId = new Map<string, LeaderboardPostType>();
  for (const post of postsRes.data ?? []) {
    const postType = matchPostType(post.post_type);
    if (postType && (NEWSLETTER_POST_TYPES as readonly string[]).includes(postType)) {
      typeByPostId.set(post.id, postType);
    }
  }

  type Bucket = { openRateSum: number; openRateCount: number; viewsSum: number; hasViews: boolean };
  const buckets = new Map<string, Bucket>(); // key: `${postType}|${snapshot_date}`

  for (const snap of snapshotsRes.data ?? []) {
    const postType = typeByPostId.get(snap.post_id);
    if (!postType) continue;
    const key = `${postType}|${snap.snapshot_date}`;
    const bucket = buckets.get(key) ?? { openRateSum: 0, openRateCount: 0, viewsSum: 0, hasViews: false };
    if (snap.open_rate != null) {
      bucket.openRateSum += snap.open_rate;
      bucket.openRateCount += 1;
    }
    if (snap.views != null) {
      bucket.viewsSum += snap.views;
      bucket.hasViews = true;
    }
    buckets.set(key, bucket);
  }

  return NEWSLETTER_POST_TYPES.map((postType) => {
    const dates = Array.from(buckets.keys())
      .filter((key) => key.startsWith(`${postType}|`))
      .map((key) => key.slice(postType.length + 1))
      .sort();

    const points: SectionTimelinePoint[] = dates.map((date) => {
      const bucket = buckets.get(`${postType}|${date}`)!;
      return {
        date,
        openRate: bucket.openRateCount > 0 ? bucket.openRateSum / bucket.openRateCount : null,
        views: bucket.hasViews ? bucket.viewsSum : null,
      };
    });

    return { postType, points };
  });
}

export async function getSnapshotsForPost(postId: string): Promise<MetricSnapshot[]> {
  const supabase = createAnonClient();
  const { data, error } = await supabase
    .from("metric_snapshots")
    .select("*")
    .eq("post_id", postId)
    .order("snapshot_date", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as MetricSnapshot[];
}
