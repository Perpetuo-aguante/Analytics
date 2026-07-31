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

export type AggregateMetricFilters = {
  postType?: string;
  publishedFrom?: string;
  publishedTo?: string;
};

export type AggregateMetrics = {
  postCount: number;
  avgOpenRate: number | null;
  avgEngagement: number | null;
  avgNewSubscribers: number | null;
  avgViews: number | null;
};

function average(values: number[]): number | null {
  return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

// Promedio agregado (open rate, engagement, nuevos suscriptores, views) del
// snapshot más reciente de cada post que matchea los filtros. Es el número
// "de un vistazo" para la sección de promedios; getMovingAverages (abajo) es
// la versión histórica/suavizada de lo mismo.
export async function getAggregateMetrics(filters: AggregateMetricFilters = {}): Promise<AggregateMetrics> {
  const supabase = createAnonClient();
  let query = supabase.from("current_metrics").select("*");
  if (filters.postType) query = query.eq("post_type", filters.postType);
  if (filters.publishedFrom) query = query.gte("published_at", filters.publishedFrom);
  if (filters.publishedTo) query = query.lte("published_at", filters.publishedTo);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as CurrentMetric[];

  const pick = (key: keyof CurrentMetric) =>
    rows.map((r) => r[key]).filter((v): v is number => typeof v === "number");

  return {
    postCount: rows.length,
    avgOpenRate: average(pick("open_rate")),
    avgEngagement: average(pick("engagement")),
    avgNewSubscribers: average(pick("new_subscribers")),
    avgViews: average(pick("views")),
  };
}

export type MovingAveragePoint = {
  date: string;
  avgOpenRate: number | null;
  avgEngagement: number | null;
  avgNewSubscribers: number | null;
  avgViews: number | null;
};

// Cuántas cargas semanales se promedian para suavizar la serie histórica.
const MOVING_AVERAGE_WINDOW = 3;

type MetricBucket = {
  openRateSum: number;
  openRateCount: number;
  engagementSum: number;
  engagementCount: number;
  subsSum: number;
  subsCount: number;
  viewsSum: number;
  viewsCount: number;
};

function emptyMetricBucket(): MetricBucket {
  return {
    openRateSum: 0,
    openRateCount: 0,
    engagementSum: 0,
    engagementCount: 0,
    subsSum: 0,
    subsCount: 0,
    viewsSum: 0,
    viewsCount: 0,
  };
}

// Media móvil histórica de los mismos 4 promedios que getAggregateMetrics,
// pero por carga semanal: primero se calcula el promedio transversal de
// cada carga (todos los posts que matchean los filtros, en esa fecha),
// después se suaviza con una ventana móvil de MOVING_AVERAGE_WINDOW cargas
// para reducir el ruido semana a semana.
export async function getMovingAverages(filters: AggregateMetricFilters = {}): Promise<MovingAveragePoint[]> {
  const supabase = createAnonClient();
  let postsQuery = supabase.from("posts").select("id, post_type, published_at");
  if (filters.postType) postsQuery = postsQuery.eq("post_type", filters.postType);
  if (filters.publishedFrom) postsQuery = postsQuery.gte("published_at", filters.publishedFrom);
  if (filters.publishedTo) postsQuery = postsQuery.lte("published_at", filters.publishedTo);

  const [postsRes, snapshotsRes] = await Promise.all([
    postsQuery,
    supabase.from("metric_snapshots").select("post_id, snapshot_date, views, new_subscribers, open_rate, engagement"),
  ]);
  if (postsRes.error) throw new Error(postsRes.error.message);
  if (snapshotsRes.error) throw new Error(snapshotsRes.error.message);

  const includedPostIds = new Set((postsRes.data ?? []).map((p) => p.id as string));

  const buckets = new Map<string, MetricBucket>(); // key: snapshot_date
  for (const snap of snapshotsRes.data ?? []) {
    if (!includedPostIds.has(snap.post_id as string)) continue;
    const date = snap.snapshot_date as string;
    const bucket = buckets.get(date) ?? emptyMetricBucket();
    if (snap.open_rate != null) {
      bucket.openRateSum += snap.open_rate;
      bucket.openRateCount += 1;
    }
    if (snap.engagement != null) {
      bucket.engagementSum += snap.engagement;
      bucket.engagementCount += 1;
    }
    if (snap.new_subscribers != null) {
      bucket.subsSum += snap.new_subscribers;
      bucket.subsCount += 1;
    }
    if (snap.views != null) {
      bucket.viewsSum += snap.views;
      bucket.viewsCount += 1;
    }
    buckets.set(date, bucket);
  }

  const dates = Array.from(buckets.keys()).sort();
  const raw = dates.map((date) => {
    const b = buckets.get(date)!;
    return {
      date,
      avgOpenRate: b.openRateCount > 0 ? b.openRateSum / b.openRateCount : null,
      avgEngagement: b.engagementCount > 0 ? b.engagementSum / b.engagementCount : null,
      avgNewSubscribers: b.subsCount > 0 ? b.subsSum / b.subsCount : null,
      avgViews: b.viewsCount > 0 ? b.viewsSum / b.viewsCount : null,
    };
  });

  const metricKeys = ["avgOpenRate", "avgEngagement", "avgNewSubscribers", "avgViews"] as const;
  return raw.map((point, i) => {
    const windowSlice = raw.slice(Math.max(0, i - MOVING_AVERAGE_WINDOW + 1), i + 1);
    const smoothed: MovingAveragePoint = {
      date: point.date,
      avgOpenRate: null,
      avgEngagement: null,
      avgNewSubscribers: null,
      avgViews: null,
    };
    for (const key of metricKeys) {
      const values = windowSlice.map((p) => p[key]).filter((v): v is number => v != null);
      smoothed[key] = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
    }
    return smoothed;
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
