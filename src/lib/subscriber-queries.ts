import { REGION_ORDER, countryLabel, countryRegion, sameCountry } from "./geo";
import { createAnonClient } from "./supabase/server";
import type { CurrentSubscriberMetric, SubscriberSnapshot } from "./supabase/types";

// Tipos de suscripción paga observados en el export de Substack. El
// desglose por tipo (gráfico "Suscriptores por tipo") no depende de esta
// lista — usa el valor crudo de `type` — pero la comparación gratis-vs-pago
// sí necesita saber cuáles cuentan como "pago".
const PAID_TYPES = new Set(["Yearly Subscriber", "Monthly Subscriber", "Perpetuamente Perpetuo", "Yearly Gift"]);

export function isPaidType(type: string | null): boolean {
  return type != null && PAID_TYPES.has(type);
}

// Antigüedad en días: desde el alta hasta la baja (si canceló) o hasta hoy.
export function computeTenureDays(startDate: string | null, cancelDate: string | null): number | null {
  if (!startDate) return null;
  const start = new Date(startDate).getTime();
  if (Number.isNaN(start)) return null;
  const end = cancelDate ? new Date(cancelDate).getTime() : Date.now();
  if (Number.isNaN(end)) return null;
  return Math.max(0, Math.round((end - start) / 86_400_000));
}

export type SubscriberListRow = CurrentSubscriberMetric & { tenureDays: number | null };

export type SubscriberFilters = {
  q?: string;
  type?: string;
  country?: string;
  section?: string;
  minActivity?: number;
  status?: "activo" | "cancelado";
};

export type SubscriberSort = "antiguedad" | "open_rate" | "actividad" | "revenue" | "views";

// Supabase/PostgREST corta cualquier select sin .range() en 1000 filas por
// default (configurable en Project Settings → API → Max Rows, pero 1000 es
// lo usual). Con ~4000 suscriptores eso truncaba silenciosamente el panel y
// la lista a los primeros 1000 — el import en sí escribía todo bien, era
// solo la lectura la que se quedaba corta. Por eso acá se pagina hasta
// agotar las filas en vez de un único `.select("*")`.
const SUPABASE_PAGE_SIZE = 1000;

async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await fetchPage(from, from + SUPABASE_PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < SUPABASE_PAGE_SIZE) break;
    from += SUPABASE_PAGE_SIZE;
  }
  return all;
}

export async function fetchAllSubscriberMetrics(): Promise<CurrentSubscriberMetric[]> {
  const supabase = createAnonClient();
  return fetchAllPages<CurrentSubscriberMetric>((from, to) =>
    supabase.from("current_subscriber_metrics").select("*").range(from, to)
  );
}

export async function getSubscribers(
  filters: SubscriberFilters = {},
  sort: SubscriberSort = "antiguedad"
): Promise<SubscriberListRow[]> {
  const rows = await fetchAllSubscriberMetrics();

  const q = filters.q?.trim().toLowerCase();
  let result: SubscriberListRow[] = rows
    .filter((r) => !q || r.email.toLowerCase().includes(q) || (r.name ?? "").toLowerCase().includes(q))
    .filter((r) => !filters.type || r.type === filters.type)
    // El país se compara normalizado, no como texto crudo: así el enlace
    // "ver la lista de España" que arma /suscriptores/geografia cae bien
    // aunque algunas filas digan "Spain" y otras "ES".
    .filter((r) => !filters.country || sameCountry(r.country, filters.country))
    .filter((r) => !filters.section || (r.sections ?? []).includes(filters.section as string))
    .filter((r) => filters.minActivity == null || (r.activity ?? -1) >= filters.minActivity)
    .filter((r) => {
      if (!filters.status) return true;
      const cancelled = r.cancel_date != null;
      return filters.status === "cancelado" ? cancelled : !cancelled;
    })
    .map((r) => ({ ...r, tenureDays: computeTenureDays(r.start_date, r.cancel_date) }));

  const byNumberDesc =
    (key: (row: SubscriberListRow) => number | null) => (a: SubscriberListRow, b: SubscriberListRow) => {
      const av = key(a);
      const bv = key(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return bv - av;
    };

  switch (sort) {
    case "open_rate":
      result = result.sort(byNumberDesc((r) => r.open_rate_6mo));
      break;
    case "actividad":
      result = result.sort(byNumberDesc((r) => r.activity));
      break;
    case "revenue":
      result = result.sort(byNumberDesc((r) => r.revenue));
      break;
    case "views":
      result = result.sort(byNumberDesc((r) => r.post_views));
      break;
    case "antiguedad":
    default:
      result = result.sort(byNumberDesc((r) => r.tenureDays));
      break;
  }

  return result;
}

export async function getSubscriberFilterOptions(): Promise<{
  types: string[];
  countries: string[];
  sections: string[];
}> {
  const supabase = createAnonClient();
  const rows = await fetchAllPages<{ type: string | null; country: string | null; sections: string[] | null }>(
    (from, to) => supabase.from("subscribers").select("type, country, sections").range(from, to)
  );

  const types = new Set<string>();
  const countries = new Set<string>();
  const sections = new Set<string>();
  for (const row of rows) {
    if (row.type) types.add(row.type);
    if (row.country) countries.add(row.country);
    for (const section of row.sections ?? []) sections.add(section);
  }
  return {
    types: Array.from(types).sort(),
    countries: Array.from(countries).sort(),
    sections: Array.from(sections).sort(),
  };
}

export type SubscriberDetail = {
  subscriber: SubscriberListRow;
  history: SubscriberSnapshot[];
};

export async function getSubscriberById(id: string): Promise<SubscriberDetail | null> {
  const supabase = createAnonClient();
  const [metricRes, historyRes] = await Promise.all([
    supabase.from("current_subscriber_metrics").select("*").eq("subscriber_id", id).maybeSingle(),
    supabase
      .from("subscriber_snapshots")
      .select("*")
      .eq("subscriber_id", id)
      .order("snapshot_date", { ascending: true }),
  ]);
  if (metricRes.error) throw new Error(metricRes.error.message);
  if (historyRes.error) throw new Error(historyRes.error.message);
  if (!metricRes.data) return null;

  const row = metricRes.data as CurrentSubscriberMetric;
  return {
    subscriber: { ...row, tenureDays: computeTenureDays(row.start_date, row.cancel_date) },
    history: (historyRes.data ?? []) as SubscriberSnapshot[],
  };
}

export type BreakdownItem = { label: string; value: number };

export type SubscriberDashboard = {
  totalSubscribers: number;
  freeCount: number;
  paidCount: number;
  compCount: number;
  cancelledCount: number;
  totalRevenue: number;
  avgOpenRate: number | null;
  avgActivity: number | null;
  typeBreakdown: BreakdownItem[];
  sectionBreakdown: BreakdownItem[];
  countryBreakdown: BreakdownItem[];
  regionBreakdown: BreakdownItem[];
  activityBreakdown: BreakdownItem[];
  openRateBreakdown: BreakdownItem[];
  tenureBreakdown: BreakdownItem[];
  revenueByPlan: BreakdownItem[];
  growthOverTime: { date: string; value: number }[];
  freeVsPaid: {
    free: CohortStats;
    paid: CohortStats;
  };
};

export type CohortStats = {
  count: number;
  avgOpenRate: number | null;
  avgActivity: number | null;
  avgPostViews: number | null;
  avgTenureDays: number | null;
};

function average(values: (number | null | undefined)[]): number | null {
  const nums = values.filter((v): v is number => v != null);
  return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

function sortedBreakdown(counts: Map<string, number>, limit?: number): BreakdownItem[] {
  const items = Array.from(counts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
  if (limit == null || items.length <= limit) return items;
  const top = items.slice(0, limit);
  const restSum = items.slice(limit).reduce((sum, i) => sum + i.value, 0);
  return [...top, { label: "Otros", value: restSum }];
}

// Para distribuciones con un orden natural (actividad, open rate, antigüedad)
// no conviene ordenar por cantidad — se pierde la forma de la distribución.
// Esta variante respeta el orden de `order` y solo omite buckets en 0.
const OPEN_RATE_BUCKET_ORDER = ["0-20%", "20-40%", "40-60%", "60-80%", "80-100%", "Sin emails recibidos"];
const TENURE_BUCKET_ORDER = ["< 1 mes", "1-3 meses", "3-6 meses", "6-12 meses", "1-2 años", "2+ años"];
const ACTIVITY_BUCKET_ORDER = [0, 1, 2, 3, 4, 5].map((n) => `Actividad ${n}`);

function orderedBreakdown(counts: Map<string, number>, order: string[]): BreakdownItem[] {
  return order.filter((label) => (counts.get(label) ?? 0) > 0).map((label) => ({ label, value: counts.get(label)! }));
}

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7); // "YYYY-MM"
}

function cohortStats(rows: (CurrentSubscriberMetric & { tenureDays: number | null })[]): CohortStats {
  return {
    count: rows.length,
    avgOpenRate: average(rows.map((r) => r.open_rate_6mo)),
    avgActivity: average(rows.map((r) => r.activity)),
    avgPostViews: average(rows.map((r) => r.post_views)),
    avgTenureDays: average(rows.map((r) => r.tenureDays)),
  };
}

export async function getSubscriberDashboard(): Promise<SubscriberDashboard> {
  const raw = await fetchAllSubscriberMetrics();
  const rows = raw.map((r) => ({ ...r, tenureDays: computeTenureDays(r.start_date, r.cancel_date) }));

  const typeCounts = new Map<string, number>();
  const sectionCounts = new Map<string, number>();
  const countryCounts = new Map<string, number>();
  const regionCounts = new Map<string, number>();
  const activityCounts = new Map<string, number>();
  const openRateCounts = new Map<string, number>();
  const tenureCounts = new Map<string, number>();
  const revenueByPlan = new Map<string, number>();
  const signupsByMonth = new Map<string, number>();
  const cancelsByMonth = new Map<string, number>();

  let totalRevenue = 0;
  let cancelledCount = 0;
  let freeCount = 0;
  let paidCount = 0;
  let compCount = 0;

  for (const row of rows) {
    typeCounts.set(row.type ?? "Sin tipo", (typeCounts.get(row.type ?? "Sin tipo") ?? 0) + 1);
    for (const section of row.sections ?? []) sectionCounts.set(section, (sectionCounts.get(section) ?? 0) + 1);
    // Los países se cuentan normalizados (ver lib/geo.ts): sin eso, "Spain",
    // "España" y "ES" arman tres barras distintas del mismo país.
    const country = countryLabel(row.country);
    countryCounts.set(country, (countryCounts.get(country) ?? 0) + 1);
    const region = countryRegion(row.country);
    regionCounts.set(region, (regionCounts.get(region) ?? 0) + 1);

    if (row.activity != null) {
      const key = `Actividad ${row.activity}`;
      activityCounts.set(key, (activityCounts.get(key) ?? 0) + 1);
    }

    if (row.open_rate_6mo == null) {
      openRateCounts.set("Sin emails recibidos", (openRateCounts.get("Sin emails recibidos") ?? 0) + 1);
    } else {
      const pct = row.open_rate_6mo * 100;
      const bucket =
        pct < 20 ? "0-20%" : pct < 40 ? "20-40%" : pct < 60 ? "40-60%" : pct < 80 ? "60-80%" : "80-100%";
      openRateCounts.set(bucket, (openRateCounts.get(bucket) ?? 0) + 1);
    }

    if (row.tenureDays != null) {
      const d = row.tenureDays;
      const bucket =
        d < 30
          ? "< 1 mes"
          : d < 90
            ? "1-3 meses"
            : d < 180
              ? "3-6 meses"
              : d < 365
                ? "6-12 meses"
                : d < 730
                  ? "1-2 años"
                  : "2+ años";
      tenureCounts.set(bucket, (tenureCounts.get(bucket) ?? 0) + 1);
    }

    if (row.stripe_plan && row.revenue) {
      revenueByPlan.set(row.stripe_plan, (revenueByPlan.get(row.stripe_plan) ?? 0) + row.revenue);
    }
    totalRevenue += row.revenue ?? 0;

    if (row.cancel_date) {
      cancelledCount += 1;
      cancelsByMonth.set(monthKey(row.cancel_date), (cancelsByMonth.get(monthKey(row.cancel_date)) ?? 0) + 1);
    }
    if (row.start_date) {
      signupsByMonth.set(monthKey(row.start_date), (signupsByMonth.get(monthKey(row.start_date)) ?? 0) + 1);
    }

    if (row.type === "Free") freeCount += 1;
    else if (row.type === "Comp") compCount += 1;
    else if (isPaidType(row.type)) paidCount += 1;
  }

  // Crecimiento neto acumulado: altas menos bajas, mes a mes, desde el
  // primer mes con datos hasta el actual.
  const allMonths = new Set([...signupsByMonth.keys(), ...cancelsByMonth.keys()]);
  const sortedMonths = Array.from(allMonths).sort();
  let running = 0;
  const growthOverTime = sortedMonths.map((month) => {
    running += (signupsByMonth.get(month) ?? 0) - (cancelsByMonth.get(month) ?? 0);
    return { date: month, value: running };
  });

  const freeRows = rows.filter((r) => r.type === "Free");
  const paidRows = rows.filter((r) => isPaidType(r.type));

  return {
    totalSubscribers: rows.length,
    freeCount,
    paidCount,
    compCount,
    cancelledCount,
    totalRevenue,
    avgOpenRate: average(rows.map((r) => r.open_rate_6mo)),
    avgActivity: average(rows.map((r) => r.activity)),
    typeBreakdown: sortedBreakdown(typeCounts),
    sectionBreakdown: sortedBreakdown(sectionCounts),
    countryBreakdown: sortedBreakdown(countryCounts, 8),
    regionBreakdown: orderedBreakdown(regionCounts, REGION_ORDER),
    activityBreakdown: orderedBreakdown(activityCounts, ACTIVITY_BUCKET_ORDER),
    openRateBreakdown: orderedBreakdown(openRateCounts, OPEN_RATE_BUCKET_ORDER),
    tenureBreakdown: orderedBreakdown(tenureCounts, TENURE_BUCKET_ORDER),
    revenueByPlan: sortedBreakdown(revenueByPlan),
    growthOverTime,
    freeVsPaid: {
      free: cohortStats(freeRows),
      paid: cohortStats(paidRows),
    },
  };
}
