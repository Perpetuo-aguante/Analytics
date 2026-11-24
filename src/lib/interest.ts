import { query } from "./db";
import { matchPostCategories } from "./post-types";
import type { Category } from "./categories";
import type { CurrentMetric } from "./db-types";

// Interés a lo largo del tiempo: cuántas vistas NUEVAS gana un post entre
// una carga y la siguiente.
//
// Substack exporta vistas acumuladas, así que la diferencia entre dos cargas
// son las vistas que llegaron en ese intervalo. Se divide por los días del
// intervalo porque no todos duran lo mismo (con cargas martes/jueves/sábado
// hay intervalos de 2 y de 3 días, y las cargas manuales viejas eran
// semanales): sin eso, un intervalo largo parecería un pico.

export type InterestInterval = {
  start: string; // YYYY-MM-DD (publicación o carga anterior)
  end: string; // YYYY-MM-DD (carga)
  days: number;
  newViews: number;
  perDay: number;
  launch: boolean; // el primer tramo, desde la publicación
};

export type SnapshotViews = { snapshot_date: string; views: number | null };

const DAY_MS = 86_400_000;

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

export function interestIntervals(snapshots: SnapshotViews[], publishedAt: string | null): InterestInterval[] {
  const valid = snapshots
    .filter((s): s is { snapshot_date: string; views: number } => s.views != null)
    .sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
  const intervals: InterestInterval[] = [];
  let prev: { date: string; views: number } | null =
    publishedAt && valid.length > 0 && publishedAt < valid[0].snapshot_date ? { date: publishedAt, views: 0 } : null;
  let launch = prev != null;
  for (const snap of valid) {
    if (prev) {
      const days = Math.max(daysBetween(prev.date, snap.snapshot_date), 1);
      // Si un export trae menos vistas que el anterior (corrección de
      // Substack), no hay vistas "negativas": el tramo cuenta como 0.
      const newViews = Math.max(snap.views - prev.views, 0);
      intervals.push({ start: prev.date, end: snap.snapshot_date, days, newViews, perDay: newViews / days, launch });
      launch = false;
    }
    prev = { date: snap.snapshot_date, views: snap.views };
  }
  return intervals;
}

// Un post vuelve a despertar interés cuando, pasado su lanzamiento, un tramo
// gana bastante más que su ritmo habitual. Los umbrales evitan falsas
// alarmas en posts chicos: pasar de 1 a 3 vistas por día no es noticia.
export const SECOND_LIFE_MIN_AGE_DAYS = 21;
export const SECOND_LIFE_RATIO = 3;
export const SECOND_LIFE_MIN_PER_DAY = 5;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export type PeakSummary = {
  peak: InterestInterval | null; // el tramo con más vistas por día
  baselinePerDay: number | null; // mediana de los tramos posteriores al lanzamiento
  resurgences: InterestInterval[]; // tramos de "segunda vida"
};

export function summarizePeaks(intervals: InterestInterval[], publishedAt: string | null): PeakSummary {
  const peak = intervals.reduce<InterestInterval | null>((best, i) => (!best || i.perDay > best.perDay ? i : best), null);
  const settled = intervals.filter((i) => !i.launch && (!publishedAt || daysBetween(publishedAt, i.start) >= 7));
  const baselinePerDay = median(settled.map((i) => i.perDay));
  const resurgences = publishedAt
    ? settled.filter(
        (i) =>
          daysBetween(publishedAt, i.start) >= SECOND_LIFE_MIN_AGE_DAYS &&
          i.perDay >= SECOND_LIFE_MIN_PER_DAY &&
          i.perDay >= SECOND_LIFE_RATIO * Math.max(medianExcluding(settled, i) ?? 0, 0.5)
      )
    : [];
  return { peak: peak && peak.perDay > 0 ? peak : null, baselinePerDay, resurgences };
}

// La mediana sin el propio tramo: si no, un pico fuerte en un post con
// pocos tramos sube su propia vara.
function medianExcluding(intervals: InterestInterval[], excluded: InterestInterval): number | null {
  return median(intervals.filter((i) => i !== excluded).map((i) => i.perDay));
}

// ───────────── Tendencias (todos los posts del recorte) ─────────────

export type TrendingPost = {
  post: CurrentMetric;
  latest: InterestInterval;
  baselinePerDay: number | null;
  ratio: number | null; // latest.perDay / baseline
  ageDays: number | null;
  secondLife: boolean; // el último tramo es una "segunda vida" (ver summarizePeaks)
};

export type SectionWeek = { week: string; newViews: number };

export type InterestOverview = {
  latestUpload: string | null;
  rising: TrendingPost[]; // más vistas por día en el último tramo
  secondLife: TrendingPost[]; // posts viejos que volvieron a subir
  sections: { category: Category; weeks: SectionWeek[] }[];
};

const RISING_LIMIT = 10;

// Lunes de la semana (ISO) de una fecha YYYY-MM-DD.
export function weekStart(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const offset = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - offset * DAY_MS).toISOString().slice(0, 10);
}

export async function getInterestOverview(rows: CurrentMetric[], categories: Category[]): Promise<InterestOverview> {
  if (rows.length === 0) return { latestUpload: null, rising: [], secondLife: [], sections: [] };
  const snapshots = await query<{ post_id: string; snapshot_date: string; views: number | null }>(
    "select post_id, snapshot_date, views from metric_snapshots where post_id = any($1::uuid[])",
    [rows.map((r) => r.post_id)]
  );
  const byPost = new Map<string, SnapshotViews[]>();
  for (const s of snapshots) {
    const list = byPost.get(s.post_id) ?? [];
    list.push(s);
    byPost.set(s.post_id, list);
  }
  const latestUpload = snapshots.reduce<string | null>((max, s) => (!max || s.snapshot_date > max ? s.snapshot_date : max), null);

  const trending: TrendingPost[] = [];
  const weekly = new Map<string, Map<string, number>>(); // category.id → week → views
  for (const post of rows) {
    const intervals = interestIntervals(byPost.get(post.post_id) ?? [], post.published_at);
    if (intervals.length === 0) continue;

    for (const category of matchPostCategories(post.post_type, post.extra_post_types, categories)) {
      const weeks = weekly.get(category.id) ?? new Map<string, number>();
      for (const i of intervals) weeks.set(weekStart(i.end), (weeks.get(weekStart(i.end)) ?? 0) + i.newViews);
      weekly.set(category.id, weeks);
    }

    const latest = intervals[intervals.length - 1];
    // Solo cuenta como "ahora" si el último tramo termina en la carga más
    // reciente: un post que dejó de venir en los exports no está en alza.
    if (latest.end !== latestUpload) continue;
    const { baselinePerDay, resurgences } = summarizePeaks(intervals, post.published_at);
    trending.push({
      post,
      latest,
      baselinePerDay,
      ratio: baselinePerDay && baselinePerDay > 0 ? latest.perDay / baselinePerDay : null,
      ageDays: post.published_at ? daysBetween(post.published_at, latest.end) : null,
      secondLife: resurgences.includes(latest),
    });
  }

  const rising = trending
    .filter((t) => t.latest.perDay > 0)
    .sort((a, b) => b.latest.perDay - a.latest.perDay)
    .slice(0, RISING_LIMIT);
  const secondLife = trending
    .filter((t) => t.secondLife)
    .sort((a, b) => (b.ratio ?? 0) - (a.ratio ?? 0));

  const sections = categories
    .filter((c) => weekly.has(c.id))
    .map((category) => ({
      category,
      weeks: Array.from(weekly.get(category.id)!.entries())
        .map(([week, newViews]) => ({ week, newViews }))
        .sort((a, b) => a.week.localeCompare(b.week)),
    }));

  return { latestUpload, rising, secondLife, sections };
}
