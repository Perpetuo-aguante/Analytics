import { query, queryOne } from "./db";
import type { CurrentMetric, MetricSnapshot, Post } from "./db-types";
import { NEWSLETTER_POST_TYPE_NAMES, matchPostCategories } from "./post-types";
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
// Un post entra si CUALQUIERA de sus categorías (principal o adicionales)
// está entre las elegidas: un Poema que también es de El Creativo aparece
// al filtrar por cualquiera de las dos.
function matchesTypes(
  postType: string | null,
  extra: readonly string[] | null | undefined,
  types: string[],
  categories: Category[]
): boolean {
  if (types.length === 0) return true;
  return matchPostCategories(postType, extra, categories).some((c) => types.includes(c.name));
}

function applyRowFilters<T extends { post_type: string | null; extra_post_types?: string[] | null; title?: string }>(
  rows: T[],
  filters: Filters,
  categories: Category[]
): T[] {
  const needle = filters.q?.toLowerCase();
  return rows.filter((row) => {
    if (!matchesTypes(row.post_type, row.extra_post_types, filters.types, categories)) return false;
    if (needle && !(row.title ?? "").toLowerCase().includes(needle)) return false;
    return true;
  });
}

// Trae el snapshot más reciente de cada post, ya recortado. Es la fuente de
// la tabla de posts, de los rankings y del scatter: una sola consulta por
// página en lugar de una por sección.
// Condición SQL del rango de fecha de publicación del filtro, para las
// consultas que lo aplican en la base.
function publishedAtRange(filters: Filters): { where: string; params: string[] } {
  const conditions: string[] = [];
  const params: string[] = [];
  if (filters.from) {
    params.push(filters.from);
    conditions.push(`published_at >= $${params.length}`);
  }
  if (filters.to) {
    params.push(filters.to);
    conditions.push(`published_at <= $${params.length}`);
  }
  return { where: conditions.length > 0 ? `where ${conditions.join(" and ")}` : "", params };
}

// Las series históricas se agrupan por semana (lunes a domingo) con la última
// carga de cada post en esa semana. Antes había una carga por semana; con las
// cargas automáticas hay tres, y sin agrupar, la media móvil de 3 cargas y
// las sumas por carga cambiarían de significado. snapshot_date pasa a ser el
// lunes de la semana.
function weeklySnapshotsSql(columns: string): string {
  return `select distinct on (post_id, date_trunc('week', snapshot_date))
            post_id, to_char(date_trunc('week', snapshot_date), 'YYYY-MM-DD') as snapshot_date, ${columns}
          from metric_snapshots
          order by post_id, date_trunc('week', snapshot_date), snapshot_date desc`;
}

type PostCategoryRow = Pick<Post, "id" | "post_type" | "extra_post_types" | "published_at">;

function getPostsInRange(filters: Filters): Promise<PostCategoryRow[]> {
  const { where, params } = publishedAtRange(filters);
  return query<PostCategoryRow>(`select id, post_type, extra_post_types, published_at from posts ${where}`, params);
}

export async function getFilteredMetrics(filters: Filters, categories: Category[]): Promise<CurrentMetric[]> {
  // Filtrar por fecha excluye a propósito los posts sin published_at: no se
  // puede afirmar que caigan dentro del rango.
  const { where, params } = publishedAtRange(filters);
  const rows = await query<CurrentMetric>(
    `select * from current_metrics ${where} order by published_at desc nulls last`,
    params
  );
  return applyRowFilters(rows, filters, categories);
}

// Ranking global por la métrica elegida. limit null = todos.
export function leaderboard(rows: CurrentMetric[], metric: RankingMetric, limit: number | null): CurrentMetric[] {
  const sorted = rankBy(rows, metric);
  return limit == null ? sorted : sorted.slice(0, limit);
}

// El mismo ranking pero partido por sección — "el ranking por open rate de
// Anteojos, lo mismo de Estelares". Solo devuelve las secciones que tienen
// algo que mostrar bajo el filtro actual, para no dejar columnas vacías.
// Un post con varias categorías entra en el ranking de cada una.
export function leaderboardsByType(
  rows: CurrentMetric[],
  metric: RankingMetric,
  limit: number | null,
  categories: Category[]
): { category: Category; rows: CurrentMetric[] }[] {
  const grouped = new Map<string, CurrentMetric[]>(categories.map((c) => [c.id, []]));
  for (const row of rows) {
    for (const category of matchPostCategories(row.post_type, row.extra_post_types, categories)) {
      grouped.get(category.id)!.push(row);
    }
  }

  return categories
    .map((category) => {
      const sorted = rankBy(grouped.get(category.id) ?? [], metric);
      return { category, rows: limit == null ? sorted : sorted.slice(0, limit) };
    })
    .filter((group) => group.rows.length > 0);
}

export async function getPostBySlug(slug: string): Promise<Post | null> {
  return queryOne<Post>("select * from posts where slug = $1", [slug]);
}

// Punto de un scatter: un post con su categoría canónica ya resuelta (se
// descartan los que no matchean ninguna, para que el color/forma sean
// siempre válidos). Un punto lleva UN solo color: el de la categoría
// principal, o la primera adicional si la principal no matchea.
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
    const [category] = matchPostCategories(row.post_type, row.extra_post_types, categories);
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
// Un post con varias categorías suma en la serie de cada una.
export async function getSectionTimelines(
  filters: Filters,
  categories: Category[]
): Promise<{ category: Category; points: SectionTimelinePoint[] }[]> {
  const [posts, snapshots] = await Promise.all([
    getPostsInRange(filters),
    query<Pick<MetricSnapshot, "post_id" | "snapshot_date" | "views" | "open_rate">>(
      weeklySnapshotsSql("views, open_rate")
    ),
  ]);

  // Si el usuario no eligió secciones, se muestran las que se envían por
  // newsletter (las únicas donde "open rate por carga" significa algo). Si
  // eligió, manda su elección.
  const requested: Category[] =
    filters.types.length > 0
      ? categories.filter((c) => filters.types.includes(c.name))
      : categories.filter((c) => NEWSLETTER_POST_TYPE_NAMES.includes(c.name));

  const categoriesByPostId = new Map<string, Category[]>();
  for (const post of posts) {
    const matched = matchPostCategories(post.post_type, post.extra_post_types, categories).filter((category) =>
      requested.some((r) => r.id === category.id)
    );
    if (matched.length > 0) categoriesByPostId.set(post.id, matched);
  }

  type Bucket = { openRateSum: number; openRateCount: number; viewsSum: number; hasViews: boolean };
  const buckets = new Map<string, Bucket>(); // key: `${category.id}|${snapshot_date}`

  for (const snap of snapshots) {
    for (const category of categoriesByPostId.get(snap.post_id) ?? []) {
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
  totalEstimatedValue: number | null;
  avgEstimatedValue: number | null;
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
    totalEstimatedValue: sum(pick("estimated_value")),
    avgEstimatedValue: average(pick("estimated_value")),
  };
}

export type MovingAveragePoint = {
  date: string;
  avgOpenRate: number | null;
  avgEngagement: number | null;
  avgNewSubscribers: number | null;
  avgViews: number | null;
};

// Cuántas semanas se promedian para suavizar la serie histórica.
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
  const [posts, snapshots] = await Promise.all([
    getPostsInRange(filters),
    query<Pick<MetricSnapshot, "post_id" | "snapshot_date" | "views" | "new_subscribers" | "open_rate" | "engagement">>(
      weeklySnapshotsSql("views, new_subscribers, open_rate, engagement")
    ),
  ]);

  const includedPostIds = new Set(
    posts.filter((p) => matchesTypes(p.post_type, p.extra_post_types, filters.types, categories)).map((p) => p.id)
  );

  const buckets = new Map<string, MetricBucket>(); // key: snapshot_date
  for (const snap of snapshots) {
    if (!includedPostIds.has(snap.post_id)) continue;
    const date = snap.snapshot_date;
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
  return query<MetricSnapshot>("select * from metric_snapshots where post_id = $1 order by snapshot_date asc", [
    postId,
  ]);
}
