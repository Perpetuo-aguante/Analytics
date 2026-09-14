// Analítica geográfica de suscriptores: de dónde vienen y cómo cambia eso
// con el tiempo.
//
// De dónde sale el histórico. `subscribers` no guarda una foto del país mes
// a mes — el país es un atributo que se pisa en cada carga — pero sí guarda
// `start_date` y `cancel_date` de cada suscriptor. Con esas dos fechas se
// reconstruye, para cualquier momento del pasado, quién estaba dado de alta
// y quién no; agrupando por país se obtiene la serie histórica de cada uno
// sin necesidad de haber guardado nada extra. Dos límites que eso implica, y
// que la página dice en pantalla:
//
//   1. El país es el ACTUAL, no el que tenía el suscriptor entonces. Si
//      alguien se mudó, su historia entera se cuenta en su país de hoy.
//   2. Solo se reconstruye a quien sigue en el export. Substack lista a los
//      cancelados (con su `cancel_date`), así que las bajas sí están; lo que
//      no se puede ver es a quien fue borrado de la lista por completo.
//
// Un suscriptor cuenta como activo en una fecha si ya se había dado de alta
// y todavía no había cancelado. Las comparaciones son entre strings
// "YYYY-MM-DD", que para fechas ISO ordenan igual que las fechas y evitan
// cualquier corrimiento por zona horaria.

import {
  NO_COUNTRY_KEY,
  REGION_ORDER,
  countryKey,
  countryLabel,
  countryRegion,
  type RegionLabel,
} from "./geo";
import { fetchAllSubscriberMetrics, isPaidType } from "./subscriber-queries";
import type { CurrentSubscriberMetric } from "./supabase/types";

export const GEO_WINDOWS = [
  { key: "90", label: "90 días", days: 90 },
  { key: "180", label: "6 meses", days: 180 },
  { key: "365", label: "1 año", days: 365 },
] as const;

export type GeoWindow = (typeof GEO_WINDOWS)[number];
export type GeoWindowKey = GeoWindow["key"];

export const DEFAULT_GEO_WINDOW: GeoWindowKey = "180";

export function parseGeoWindow(value: string | undefined): GeoWindow {
  return GEO_WINDOWS.find((w) => w.key === value) ?? GEO_WINDOWS.find((w) => w.key === DEFAULT_GEO_WINDOW)!;
}

// Cuántos países llevan línea propia en el histórico. El resto se suma en
// "Otros": son 7 series, el tope que tiene validada la paleta.
export const HISTORY_SERIES_LIMIT = 6;
export const OTHERS_KEY = "otros";
export const OTHERS_LABEL = "Otros";

export type GeoTrend = "alza" | "baja" | "estable";

export type GeoStat = {
  /** Clave canónica: ISO-2 del país, o el nombre de la región. */
  key: string;
  label: string;
  /** Solo para países: la región a la que pertenece. */
  region: RegionLabel | null;
  /** Valor crudo de `country` tal como está en la base, para enlazar a la lista. */
  rawCountry: string | null;
  /** Activos hoy y al principio de la ventana, y la diferencia entre ambos. */
  active: number;
  activePrev: number;
  delta: number;
  /** Crecimiento relativo en la ventana. null si no había nadie al principio. */
  growth: number | null;
  /** Peso sobre el total de activos, hoy y al principio de la ventana. */
  share: number;
  sharePrev: number;
  /** Cambio de peso en puntos porcentuales (0.03 = +3 pp). */
  shareDelta: number;
  /** Altas y bajas ocurridas dentro de la ventana. */
  signups: number;
  cancels: number;
  /** Totales históricos, incluyendo a los cancelados. */
  total: number;
  cancelled: number;
  paid: number;
  revenue: number;
  avgOpenRate: number | null;
  avgActivity: number | null;
  trend: GeoTrend;
  /** Activos al cierre de cada mes, sobre el eje común `months`. */
  history: number[];
};

export type GeoSeries = {
  key: string;
  label: string;
  points: { date: string; value: number | null }[];
};

export type ProvinceStat = {
  label: string;
  active: number;
  activePrev: number;
  delta: number;
};

export type SubscriberGeoDashboard = {
  window: GeoWindow;
  /** Fechas de referencia del cálculo: hoy y el principio de la ventana. */
  today: string;
  windowStart: string;
  /** Fecha de la carga más reciente que alimenta estos números. */
  snapshotDate: string | null;
  totalActive: number;
  totalActivePrev: number;
  totalDelta: number;
  countriesWithSubscribers: number;
  /** Activos sin país declarado en el export. */
  withoutCountry: number;
  /** Activos sin fecha de alta: quedan fuera del histórico. */
  withoutStartDate: number;
  countries: GeoStat[];
  regions: GeoStat[];
  /** Eje común de meses ("YYYY-MM") para todas las series históricas. */
  months: string[];
  /** Activos por país, mes a mes: top países + "Otros". */
  countryHistory: GeoSeries[];
  /** Lo mismo, pero como porcentaje del total de cada mes. */
  countryShareHistory: GeoSeries[];
  /** Activos por región, mes a mes. */
  regionHistory: GeoSeries[];
  risers: GeoStat[];
  fallers: GeoStat[];
  /** Desglose por estado/provincia del país seleccionado. */
  selectedCountry: GeoStat | null;
  provinces: ProvinceStat[];
  /** Países con algún estado/provincia cargado, para el selector. */
  countriesWithProvinces: { key: string; label: string }[];
};

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function monthOf(date: string): string {
  return date.slice(0, 7);
}

function nextMonth(month: string): string {
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return m === 12 ? `${year + 1}-01` : `${year}-${String(m + 1).padStart(2, "0")}`;
}

function average(values: (number | null | undefined)[]): number | null {
  const nums = values.filter((v): v is number => v != null);
  return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

/**
 * Un cambio cuenta como tendencia solo si mueve la aguja: al menos 3
 * suscriptores Y al menos un 5% de la base que tenía el grupo al empezar la
 * ventana. Sin ese piso, un país con 4 suscriptores que gana uno aparecería
 * "creciendo 25%" arriba de todo y taparía a los movimientos reales.
 */
const MIN_ABSOLUTE_DELTA = 3;
const MIN_RELATIVE_DELTA = 0.05;

function classifyTrend(delta: number, activePrev: number): GeoTrend {
  const floor = Math.max(MIN_ABSOLUTE_DELTA, activePrev * MIN_RELATIVE_DELTA);
  if (delta >= floor) return "alza";
  if (-delta >= floor) return "baja";
  return "estable";
}

type Bucket = {
  key: string;
  label: string;
  region: RegionLabel | null;
  rawCountry: string | null;
  active: number;
  activePrev: number;
  signups: number;
  cancels: number;
  total: number;
  cancelled: number;
  paid: number;
  revenue: number;
  openRates: (number | null)[];
  activities: (number | null)[];
  signupsByMonth: Map<string, number>;
  cancelsByMonth: Map<string, number>;
};

function newBucket(key: string, label: string, region: RegionLabel | null, rawCountry: string | null): Bucket {
  return {
    key,
    label,
    region,
    rawCountry,
    active: 0,
    activePrev: 0,
    signups: 0,
    cancels: 0,
    total: 0,
    cancelled: 0,
    paid: 0,
    revenue: 0,
    openRates: [],
    activities: [],
    signupsByMonth: new Map(),
    cancelsByMonth: new Map(),
  };
}

function activeAt(row: CurrentSubscriberMetric, date: string): boolean {
  if (!row.start_date || row.start_date > date) return false;
  return row.cancel_date == null || row.cancel_date > date;
}

/** Activos al cierre de cada mes: altas acumuladas menos bajas acumuladas. */
function historyFor(bucket: Bucket, months: string[]): number[] {
  let running = 0;
  return months.map((month) => {
    running += (bucket.signupsByMonth.get(month) ?? 0) - (bucket.cancelsByMonth.get(month) ?? 0);
    return running;
  });
}

function toStat(bucket: Bucket, totalActive: number, totalActivePrev: number, months: string[]): GeoStat {
  const delta = bucket.active - bucket.activePrev;
  const share = totalActive > 0 ? bucket.active / totalActive : 0;
  const sharePrev = totalActivePrev > 0 ? bucket.activePrev / totalActivePrev : 0;
  return {
    key: bucket.key,
    label: bucket.label,
    region: bucket.region,
    rawCountry: bucket.rawCountry,
    active: bucket.active,
    activePrev: bucket.activePrev,
    delta,
    growth: bucket.activePrev > 0 ? delta / bucket.activePrev : null,
    share,
    sharePrev,
    shareDelta: share - sharePrev,
    signups: bucket.signups,
    cancels: bucket.cancels,
    total: bucket.total,
    cancelled: bucket.cancelled,
    paid: bucket.paid,
    revenue: bucket.revenue,
    avgOpenRate: average(bucket.openRates),
    avgActivity: average(bucket.activities),
    trend: classifyTrend(delta, bucket.activePrev),
    history: historyFor(bucket, months),
  };
}

function seriesFrom(label: string, key: string, months: string[], values: number[]): GeoSeries {
  return { key, label, points: months.map((month, i) => ({ date: month, value: values[i] })) };
}

export async function getSubscriberGeoDashboard(
  options: { window?: string; country?: string } = {}
): Promise<SubscriberGeoDashboard> {
  return buildGeoDashboard(await fetchAllSubscriberMetrics(), options);
}

/**
 * El cálculo, separado de la lectura de la base: recibe las filas de
 * `current_subscriber_metrics` y devuelve el panel entero. Así se puede
 * ejercitar con filas de prueba sin Supabase de por medio.
 */
export function buildGeoDashboard(
  rows: CurrentSubscriberMetric[],
  options: { window?: string; country?: string; today?: string } = {}
): SubscriberGeoDashboard {
  const window = parseGeoWindow(options.window);

  const today = options.today ?? isoDay(new Date());
  const windowStart = isoDay(new Date(Date.parse(`${today}T00:00:00Z`) - window.days * 86_400_000));

  const countryBuckets = new Map<string, Bucket>();
  const regionBuckets = new Map<string, Bucket>();
  // Estados/provincias por país, solo de los activos.
  const provinceByCountry = new Map<string, Map<string, { active: number; activePrev: number }>>();

  let totalActive = 0;
  let totalActivePrev = 0;
  let withoutCountry = 0;
  let withoutStartDate = 0;
  let snapshotDate: string | null = null;
  let firstMonth: string | null = null;

  for (const row of rows) {
    if (row.snapshot_date && (snapshotDate == null || row.snapshot_date > snapshotDate)) {
      snapshotDate = row.snapshot_date;
    }

    const key = countryKey(row.country);
    const label = countryLabel(row.country);
    const region = countryRegion(row.country);

    let country = countryBuckets.get(key);
    if (!country) {
      country = newBucket(key, label, region, row.country);
      countryBuckets.set(key, country);
    }
    let regionBucket = regionBuckets.get(region);
    if (!regionBucket) {
      regionBucket = newBucket(region, region, region, null);
      regionBuckets.set(region, regionBucket);
    }

    const isActive = activeAt(row, today);
    const wasActive = activeAt(row, windowStart);
    const signedUpInWindow = row.start_date != null && row.start_date > windowStart && row.start_date <= today;
    const cancelledInWindow = row.cancel_date != null && row.cancel_date > windowStart && row.cancel_date <= today;

    for (const bucket of [country, regionBucket]) {
      bucket.total += 1;
      if (isActive) bucket.active += 1;
      if (wasActive) bucket.activePrev += 1;
      if (signedUpInWindow) bucket.signups += 1;
      if (cancelledInWindow) bucket.cancels += 1;
      if (row.cancel_date) bucket.cancelled += 1;
      if (isPaidType(row.type)) bucket.paid += 1;
      bucket.revenue += row.revenue ?? 0;
      bucket.openRates.push(row.open_rate_6mo);
      bucket.activities.push(row.activity);

      if (row.start_date) {
        const month = monthOf(row.start_date);
        bucket.signupsByMonth.set(month, (bucket.signupsByMonth.get(month) ?? 0) + 1);
      }
      if (row.cancel_date) {
        const month = monthOf(row.cancel_date);
        bucket.cancelsByMonth.set(month, (bucket.cancelsByMonth.get(month) ?? 0) + 1);
      }
    }

    if (row.start_date) {
      const month = monthOf(row.start_date);
      if (firstMonth == null || month < firstMonth) firstMonth = month;
    } else if (isActive) {
      withoutStartDate += 1;
    }

    if (isActive) {
      totalActive += 1;
      if (key === NO_COUNTRY_KEY) withoutCountry += 1;
    }
    if (wasActive) totalActivePrev += 1;

    const province = row.state_province?.trim();
    if (province && (isActive || wasActive)) {
      let provinces = provinceByCountry.get(key);
      if (!provinces) {
        provinces = new Map();
        provinceByCountry.set(key, provinces);
      }
      const entry = provinces.get(province) ?? { active: 0, activePrev: 0 };
      if (isActive) entry.active += 1;
      if (wasActive) entry.activePrev += 1;
      provinces.set(province, entry);
    }
  }

  // Eje común de meses: del primer alta registrada hasta el mes en curso.
  const months: string[] = [];
  const currentMonth = monthOf(today);
  for (let month = firstMonth ?? currentMonth; month <= currentMonth; month = nextMonth(month)) {
    months.push(month);
  }

  const countries = Array.from(countryBuckets.values())
    .map((b) => toStat(b, totalActive, totalActivePrev, months))
    .sort((a, b) => b.active - a.active || a.label.localeCompare(b.label, "es"));

  const regions = Array.from(regionBuckets.values())
    .map((b) => toStat(b, totalActive, totalActivePrev, months))
    .sort((a, b) => REGION_ORDER.indexOf(a.key as RegionLabel) - REGION_ORDER.indexOf(b.key as RegionLabel));

  // Series históricas: los países grandes con línea propia, el resto sumado
  // en "Otros" para que el total de cada mes siga cuadrando.
  const named = countries.filter((c) => c.key !== NO_COUNTRY_KEY).slice(0, HISTORY_SERIES_LIMIT);
  const namedKeys = new Set(named.map((c) => c.key));
  const othersHistory = months.map((_, i) =>
    countries.filter((c) => !namedKeys.has(c.key)).reduce((sum, c) => sum + c.history[i], 0)
  );
  const totalHistory = months.map((_, i) => countries.reduce((sum, c) => sum + c.history[i], 0));

  const countryHistory: GeoSeries[] = [
    ...named.map((c) => seriesFrom(c.label, c.key, months, c.history)),
    ...(othersHistory.some((v) => v > 0) ? [seriesFrom(OTHERS_LABEL, OTHERS_KEY, months, othersHistory)] : []),
  ];

  const countryShareHistory: GeoSeries[] = countryHistory.map((series) => ({
    ...series,
    points: series.points.map((point, i) => ({
      date: point.date,
      value: totalHistory[i] > 0 && point.value != null ? point.value / totalHistory[i] : null,
    })),
  }));

  const regionHistory: GeoSeries[] = regions
    .filter((r) => r.active > 0)
    .map((r) => seriesFrom(r.label, r.key, months, r.history));

  // Movimientos: quién sube y quién baja dentro de la ventana. Se ordenan
  // por diferencia absoluta de suscriptores, no por porcentaje, para que
  // arriba quede lo que más cambia la composición real de la lista.
  const ranked = countries.filter((c) => c.key !== NO_COUNTRY_KEY);
  const risers = ranked.filter((c) => c.trend === "alza").sort((a, b) => b.delta - a.delta);
  const fallers = ranked.filter((c) => c.trend === "baja").sort((a, b) => a.delta - b.delta);

  // El selector de provincias es de países: un suscriptor sin país declarado
  // pero con provincia cargada no tiene dónde ir, así que queda fuera.
  const countriesWithProvinces = countries
    .filter((c) => c.key !== NO_COUNTRY_KEY && (provinceByCountry.get(c.key)?.size ?? 0) > 0)
    .map((c) => ({ key: c.key, label: c.label }));

  const selectedKey =
    countriesWithProvinces.find((c) => c.key === options.country)?.key ?? countriesWithProvinces[0]?.key ?? null;
  const selectedCountry = selectedKey ? countries.find((c) => c.key === selectedKey) ?? null : null;
  const provinces: ProvinceStat[] = Array.from(provinceByCountry.get(selectedKey ?? "")?.entries() ?? [])
    .map(([label, v]) => ({ label, active: v.active, activePrev: v.activePrev, delta: v.active - v.activePrev }))
    .sort((a, b) => b.active - a.active);

  return {
    window,
    today,
    windowStart,
    snapshotDate,
    totalActive,
    totalActivePrev,
    totalDelta: totalActive - totalActivePrev,
    countriesWithSubscribers: countries.filter((c) => c.key !== NO_COUNTRY_KEY && c.active > 0).length,
    withoutCountry,
    withoutStartDate,
    countries,
    regions,
    months,
    countryHistory,
    countryShareHistory,
    regionHistory,
    risers,
    fallers,
    selectedCountry,
    provinces,
    countriesWithProvinces,
  };
}

/**
 * Una frase que resume el movimiento de la ventana ("En los últimos 6 meses,
 * Argentina suma 124 (+18%) y España pierde 12 (−6%)"). Va arriba del panel:
 * es la respuesta corta a "¿quién sube y quién baja?" para quien no se va a
 * quedar leyendo la tabla.
 */
export function describeGeoTrends(dashboard: SubscriberGeoDashboard): string {
  const windowLabel = dashboard.window.label.toLowerCase();
  const top = dashboard.risers[0];
  const bottom = dashboard.fallers[0];

  const relative = (growth: number | null) =>
    growth != null ? ` (${growth > 0 ? "+" : "−"}${(Math.abs(growth) * 100).toFixed(1)}%)` : "";

  if (!top && !bottom) {
    return `Ningún país se movió lo suficiente como para marcar tendencia en los últimos ${windowLabel}.`;
  }

  const parts: string[] = [];
  if (top) parts.push(`${top.label} suma ${top.delta.toLocaleString("es")} suscriptores${relative(top.growth)}`);
  if (bottom) {
    parts.push(`${bottom.label} pierde ${Math.abs(bottom.delta).toLocaleString("es")}${relative(bottom.growth)}`);
  }
  return `En los últimos ${windowLabel}, ${parts.join(" y ")}.`;
}
