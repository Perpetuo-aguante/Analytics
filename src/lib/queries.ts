import { createAnonClient } from "./supabase/server";
import type { CurrentMetric, MetricSnapshot, Post } from "./supabase/types";
import { NEWSLETTER_POST_TYPE_NAMES, matchPostType } from "./post-types";
import type { Category } from "./categories";
import type { Filters } from "./filters";
import { rankBy, type RankingMetric } from "./metrics";

// Todas las consultas de esta capa toman el MISMO objeto Filters (ver
// lib/filters.ts), que sale de la URL. Es lo que garantiza que la tabla, los
// rankings y los charts de una página estén siempre mirando el mismo recorte:
// no hay forma de filtrar una cosa y olvidarse de otra.

// El recorte por fecha se hace en SQL; el de tipo de post, en memoria.
// Motivo: post_type es texto libre cargado desde el CSV y tiene alias
// históricos ("321 Editorial" = "El Creativo"), así que un .in() por nombre
// exacto dejaría fuera los posts viejos. matchPostType resuelve los alias, y
// el volumen (cientos de posts) hace que filtrar en memoria no cueste nada.
function matchesTypes(postType: string | null, types: string[], categories: Category[]): boolean {
  if (types.length === 0) return true;
  const canonical = matchPostType(postType, categories);
  return canonical != null && types.includes(canonical.name);
}

function applyRowFilters<T extends { post_type: string | null; title?: string }>(
  rows: T[],
  filters: Filters,
  categories: Category[]
): T[] {
  const needle = filters.q?.toLowerCase();
  return rows.filter((row) => {
    if (!matchesTypes(row.post_type, filters.types, categories)) return false;
    if (needle && !(row.title ?? "").toLowerCase().includes(needle)) return false;
    return true;
  });
}

// Trae el snapshot más reciente de cada post, ya recortado. Es la fuente de
// la tabla de posts, de los rankings y del scatter: una sola consulta por
// página en lugar de una por sección.
export async function getFilteredMetrics(filters: Filters, categories: Category[]): Promise<CurrentMetric[]> {
  const supabase = createAnonClient();
  let query = supabase.from("current_metrics").select("*");
  // Filtrar por fecha excluye a propósito los posts sin published_at: no se
  // puede afirmar que caigan dentro del rango.
  if (filters.from) query = query.gte("published_at", filters.from);
  if (filters.to) query = query.lte("published_at", filters.to);

  const { data, error } = await query.order("published_at", { ascending: false, nullsFirst: false });
  if (error) throw new Error(error.message);
  return applyRowFilters((data ?? []) as CurrentMetric[], filters, categories);
}

// Ranking global por la métrica elegida. limit null = todos.
export function leaderboard(rows: CurrentMetric[], metric: RankingMetric, limit: number | null): CurrentMetric[] {
  const sorted = rankBy(rows, metric);
  return limit == null ? sorted : sorted.slice(0, limit);
}

// El mismo ranking pero partido por sección — "el ranking por open rate de
// Anteojos, lo mismo de Estelares". Solo devuelve las secciones que tienen
// algo que mostrar bajo el filtro actual, para no dejar columnas vacías.
export function leaderboardsByType(
  rows: CurrentMetric[],
  metric: RankingMetric,
  limit: number | null,
  categories: Category[]
): { category: Category; rows: CurrentMetric[] }[] {
  const grouped = new Map<string, CurrentMetric[]>(categories.map((c) => [c.id, []]));
  for (const row of rows) {
    const category = matchPostType(row.post_type, categories);
    if (category) grouped.get(category.id)!.push(row);
  }

  return categories
    .map((category) => {
      const sorted = rankBy(grouped.get(category.id) ?? [], metric);
      return { category, rows: limit == null ? sorted : sorted.slice(0, limit) };
    })
    .filter((group) => group.rows.length > 0);
}

export async function getPostBySlug(slug: string): Promise<Post | null> {
  const supabase = createAnonClient();
  const { data, error } = await supabase.from("posts").select("*").eq("slug", slug).maybeSingle();
  if (error) throw new Error(error.message);
  return data as Post | null;
}

// Punto de un scatter: un post con su categoría canónica ya resuelta (se
// descartan los que no matchean ninguna, para que el color/forma sean
// siempre válidos).
export type ScatterMetric = {
  postId: string;
  slug: string;
  title: string;
  category: Category;
  views: number | null;
  newSubscribers: number | null;
  openRate: number | null;
  engagement: number | null;
};

export function toScatterMetrics(rows: CurrentMetric[], categories: Category[]): ScatterMetric[] {
  const result: ScatterMetric[] = [];
  for (const row of rows) {
    const category = matchPostType(row.post_type, categories);
    if (!category) continue;
    result.push({
      postId: row.post_id,
      slug: row.slug,
      title: row.title,
      category,
      views: row.views,
      newSubscribers: row.new_subscribers,
      openRate: row.open_rate,
      engagement: row.engagement,
    });
  }
  return result;
}

export type SectionTimelinePoint = { date: string; openRate: number | null; views: number | null };

// Serie histórica por sección: open rate promedio y views acumuladas por
// carga semanal (snapshot_date es común a todos los posts de una carga, ver
// schema.sql). Respeta el filtro de fecha de publicación y el de sección.
export async function getSectionTimelines(
  filters: Filters,
  categories: Category[]
): Promise<{ category: Category; points: SectionTimelinePoint[] }[]> {
  const supabase = createAnonClient();
  let postsQuery = supabase.from("posts").select("id, post_type, published_at");
  if (filters.from) postsQuery = postsQuery.gte("published_at", filters.from);
  if (filters.to) postsQuery = postsQuery.lte("published_at", filters.to);

  const [postsRes, snapshotsRes] = await Promise.all([
    postsQuery,
    supabase.from("metric_snapshots").select("post_id, snapshot_date, views, open_rate"),
  ]);
  if (postsRes.error) throw new Error(postsRes.error.message);
  if (snapshotsRes.error) throw new Error(snapshotsRes.error.message);

  // Si el usuario no eligió secciones, se muestran las que se envían por
  // newsletter (las únicas donde "open rate por carga" significa algo). Si
  // eligió, manda su elección.
  const requested: Category[] =
    filters.types.length > 0
      ? categories.filter((c) => filters.types.includes(c.name))
      : categories.filter((c) => NEWSLETTER_POST_TYPE_NAMES.includes(c.name));

  const categoryByPostId = new Map<string, Category>();
  for (const post of postsRes.data ?? []) {
    const category = matchPostType(post.post_type, categories);
    if (category && requested.some((r) => r.id === category.id)) categoryByPostId.set(post.id, category);
  }

  type Bucket = { openRateSum: number; openRateCount: number; viewsSum: number; hasViews: boolean };
  const buckets = new Map<string, Bucket>(); // key: `${category.id}|${snapshot_date}`

  for (const snap of snapshotsRes.data ?? []) {
    const category = categoryByPostId.get(snap.post_id);
    if (!category) continue;
    const key = `${category.id}|${snap.snapshot_date}`;
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

  return requested
    .map((category) => {
      const dates = Array.from(buckets.keys())
        .filter((key) => key.startsWith(`${category.id}|`))
        .map((key) => key.slice(category.id.length + 1))
        .sort();

      const points: SectionTimelinePoint[] = dates.map((date) => {
        const bucket = buckets.get(`${category.id}|${date}`)!;
        return {
          date,
          openRate: bucket.openRateCount > 0 ? bucket.openRateSum / bucket.openRateCount : null,
          views: bucket.hasViews ? bucket.viewsSum : null,
        };
      });

      return { category, points };
    })
    .filter((series) => series.points.length > 0);
}

export type AggregateMetrics = {
  postCount: number;
  avgOpenRate: number | null;
  avgEngagement: number | null;
  avgNewSubscribers: number | null;
  avgViews: number | null;
  totalViews: number | null;
  totalNewSubscribers: number | null;
};

function average(values: number[]): number | null {
  return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

function sum(values: number[]): number | null {
  return values.length > 0 ? values.reduce((a, b) => a + b, 0) : null;
}

// Los números "de un vistazo" del recorte actual. Se calcula sobre las filas
// ya filtradas que la página tiene en la mano, así que no dispara otra
// consulta ni puede desincronizarse de lo que se ve abajo.
export function aggregateMetrics(rows: CurrentMetric[]): AggregateMetrics {
  const pick = (key: keyof CurrentMetric) =>
    rows.map((r) => r[key]).filter((v): v is number => typeof v === "number");

  return {
    postCount: rows.length,
    avgOpenRate: average(pick("open_rate")),
    avgEngagement: average(pick("engagement")),
    avgNewSubscribers: average(pick("new_subscribers")),
    avgViews: average(pick("views")),
    totalViews: sum(pick("views")),
    totalNewSubscribers: sum(pick("new_subscribers")),
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

// Media móvil histórica de los mismos promedios que aggregateMetrics, pero
// por carga semanal: primero el promedio transversal de cada carga (todos los
// posts que matchean el filtro, en esa fecha) y después una ventana móvil de
// MOVING_AVERAGE_WINDOW cargas para bajar el ruido semana a semana.
export async function getMovingAverages(filters: Filters, categories: Category[]): Promise<MovingAveragePoint[]> {
  const supabase = createAnonClient();
  let postsQuery = supabase.from("posts").select("id, post_type, published_at");
  if (filters.from) postsQuery = postsQuery.gte("published_at", filters.from);
  if (filters.to) postsQuery = postsQuery.lte("published_at", filters.to);

  const [postsRes, snapshotsRes] = await Promise.all([
    postsQuery,
    supabase.from("metric_snapshots").select("post_id, snapshot_date, views, new_subscribers, open_rate, engagement"),
  ]);
  if (postsRes.error) throw new Error(postsRes.error.message);
  if (snapshotsRes.error) throw new Error(snapshotsRes.error.message);

  const includedPostIds = new Set(
    (postsRes.data ?? [])
      .filter((p) => matchesTypes(p.post_type as string | null, filters.types, categories))
      .map((p) => p.id as string)
  );

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
