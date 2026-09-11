// Estado de filtrado compartido por todas las secciones de la app. Vive en la
// URL (no en React state) para que sea compartible, sobreviva a un refresh, y
// para que las páginas server puedan consultar Supabase ya filtrado.
//
// La decisión importante: el rango de fechas se guarda RELATIVO ("rango=30")
// en vez de absoluto ("desde=2026-08-12&hasta=2026-09-11"). Así el chip de
// "30 días" sigue apareciendo activo mañana, el enlace compartido no se
// congela en las fechas del día que se copió, y la nav puede arrastrar el
// filtro entre secciones sin recalcular nada. Las fechas absolutas se
// resuelven en el servidor, en cada request (ver resolveRange).

import { LEADERBOARD_POST_TYPES, postTypeFromSlug, postTypeSlug, type LeaderboardPostType } from "./post-types";

// `label` es el texto del chip (corto, cabe en la barra). `scope` es la
// frase completa del subtítulo, que no siempre es "Últimos " + label:
// "Últimos 1 año" no se dice.
export const RANGE_PRESETS = [
  { key: "7", label: "7 días", scope: "Últimos 7 días", days: 7 },
  { key: "30", label: "30 días", scope: "Últimos 30 días", days: 30 },
  { key: "90", label: "90 días", scope: "Últimos 90 días", days: 90 },
  { key: "180", label: "6 meses", scope: "Últimos 6 meses", days: 180 },
  { key: "365", label: "1 año", scope: "Último año", days: 365 },
] as const;

export type RangePresetKey = (typeof RANGE_PRESETS)[number]["key"];

// "todo" = sin filtro de fecha. "custom" = usar desde/hasta tal cual.
export type RangeKey = RangePresetKey | "todo" | "custom";

// Lo que llega por searchParams. Todo opcional y todo string: es una URL.
export type FilterSearchParams = {
  rango?: string;
  desde?: string;
  hasta?: string;
  tipo?: string;
  q?: string;
};

export type Filters = {
  range: RangeKey;
  // Fechas ya resueltas (YYYY-MM-DD) listas para pasarle a Supabase.
  from: string | null;
  to: string | null;
  types: LeaderboardPostType[];
  q: string | null;
};

export const DEFAULT_RANGE: RangeKey = "todo";

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isIsoDate(value: string | undefined): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

// Convierte el rango relativo en fechas absolutas. `now` es inyectable para
// que los tests no dependan del reloj.
export function resolveRange(
  range: RangeKey,
  desde?: string,
  hasta?: string,
  now: Date = new Date()
): { from: string | null; to: string | null } {
  if (range === "todo") return { from: null, to: null };
  if (range === "custom") {
    return { from: isIsoDate(desde) ? desde : null, to: isIsoDate(hasta) ? hasta : null };
  }
  const preset = RANGE_PRESETS.find((p) => p.key === range);
  if (!preset) return { from: null, to: null };
  const from = new Date(now);
  from.setDate(from.getDate() - preset.days);
  return { from: toIsoDate(from), to: toIsoDate(now) };
}

// Los tipos viajan como slugs separados por coma ("estelar,anteojos-editorial")
// en vez de con los nombres con acentos y espacios: la URL queda legible y no
// depende de encoding. Se descartan los slugs desconocidos en vez de fallar.
export function parseTypes(value: string | undefined): LeaderboardPostType[] {
  if (!value) return [];
  const parsed = value
    .split(",")
    .map((slug) => postTypeFromSlug(slug.trim()))
    .filter((t): t is LeaderboardPostType => t != null);
  // Se deduplica y se devuelve en el orden canónico, no en el de la URL, para
  // que dos URLs con los mismos tipos produzcan exactamente el mismo render.
  return LEADERBOARD_POST_TYPES.filter((t) => parsed.includes(t));
}

export function serializeTypes(types: LeaderboardPostType[]): string {
  return types.map(postTypeSlug).join(",");
}

export function parseFilters(params: FilterSearchParams, now: Date = new Date()): Filters {
  const raw = params.rango;
  let range: RangeKey;
  if (raw && RANGE_PRESETS.some((p) => p.key === raw)) range = raw as RangePresetKey;
  else if (raw === "custom" || (!raw && (isIsoDate(params.desde) || isIsoDate(params.hasta)))) range = "custom";
  else if (raw === "todo") range = "todo";
  else range = DEFAULT_RANGE;

  const { from, to } = resolveRange(range, params.desde, params.hasta, now);
  const q = params.q?.trim();

  return { range, from, to, types: parseTypes(params.tipo), q: q ? q : null };
}

// Devuelve los searchParams que representan estos filtros, omitiendo todo lo
// que esté en su valor por defecto para que la URL quede corta ("/rankings"
// en vez de "/rankings?rango=todo&tipo=&q=").
export function filtersToSearchParams(filters: Filters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.range !== DEFAULT_RANGE) params.set("rango", filters.range);
  if (filters.range === "custom") {
    if (filters.from) params.set("desde", filters.from);
    if (filters.to) params.set("hasta", filters.to);
  }
  if (filters.types.length > 0) params.set("tipo", serializeTypes(filters.types));
  if (filters.q) params.set("q", filters.q);
  return params;
}

// Construye un href conservando los filtros actuales — lo usa la nav para que
// cambiar de sección no tire por la borda el filtro que acabas de aplicar.
export function hrefWithFilters(
  pathname: string,
  filters: Filters,
  extra: Record<string, string | undefined> = {}
): string {
  const params = filtersToSearchParams(filters);
  for (const [key, value] of Object.entries(extra)) {
    if (value == null || value === "") params.delete(key);
    else params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export function hasActiveFilters(filters: Filters): boolean {
  return filters.range !== DEFAULT_RANGE || filters.types.length > 0 || filters.q != null;
}

// Texto corto que describe el filtro activo, para los subtítulos de cada
// sección ("Últimos 30 días · Estelar, Anteojos Editorial").
export function describeFilters(filters: Filters): string {
  const parts: string[] = [];
  const preset = RANGE_PRESETS.find((p) => p.key === filters.range);
  if (preset) parts.push(preset.scope);
  else if (filters.range === "custom" && (filters.from || filters.to)) {
    parts.push(`${filters.from ?? "inicio"} → ${filters.to ?? "hoy"}`);
  } else parts.push("Todo el histórico");
  if (filters.types.length > 0) parts.push(filters.types.join(", "));
  if (filters.q) parts.push(`“${filters.q}”`);
  return parts.join(" · ");
}
