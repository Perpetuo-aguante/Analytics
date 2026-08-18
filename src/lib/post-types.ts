// Categorías de post para el leaderboard por tipo. El "tipo de post" se
// carga como texto libre desde el Excel/CSV (ver lib/columns.ts), así que
// acá lo emparejamos contra esta lista canónica ignorando mayúsculas,
// acentos y separadores.

import { normalizeHeader } from "./columns";

export const LEADERBOARD_POST_TYPES = [
  "Ensayo",
  "Cuento",
  "Poema",
  "El Creativo",
  "Anteojos Editorial",
  "Estelar",
  "Foto-Ensayo",
] as const;

export type LeaderboardPostType = (typeof LEADERBOARD_POST_TYPES)[number];

// Nombres alternativos/históricos que deben resolver al mismo tipo canónico
// de arriba. "321 Editorial" fue el nombre de "El Creativo" antes del
// rebranding: los CSVs viejos siguen trayendo el nombre viejo, y deben
// agruparse junto con los nuevos en vez de quedar afuera de los leaderboards
// y timelines por tipo.
const POST_TYPE_ALIASES: Record<string, LeaderboardPostType> = {
  "321 editorial": "El Creativo",
};

// Los tipos de post que efectivamente se envían por newsletter (a diferencia
// de contenido que solo vive en el sitio). Se usa para los dashboards que
// siguen la evolución del envío semanal (open rate, views acumuladas).
export const NEWSLETTER_POST_TYPES = ["Estelar", "El Creativo", "Anteojos Editorial"] as const satisfies readonly LeaderboardPostType[];

const NORMALIZED_TYPES = new Map<string, LeaderboardPostType>([
  ...LEADERBOARD_POST_TYPES.map((type) => [normalizeHeader(type), type] as const),
  ...Object.entries(POST_TYPE_ALIASES).map(([alias, canonical]) => [normalizeHeader(alias), canonical] as const),
]);

export function matchPostType(postType: string | null | undefined): LeaderboardPostType | null {
  if (!postType) return null;
  return NORMALIZED_TYPES.get(normalizeHeader(postType)) ?? null;
}

// Calendario editorial fijo: qué tipo de post sale qué día de la semana.
// Se usa para completar el tipo de post cuando el CSV no lo trae (cada vez
// más frecuente en los exports recientes) — ver commitImport en
// app/subir/actions.ts.
//
// - Lunes: Estelar.
// - Miércoles: Anteojos Editorial (los "sueltos" de Anteojos también salen
//   ese día, bajo el mismo tipo).
// - Viernes: es ambiguo a propósito. Ese día sale tanto "El Creativo" (la
//   edición editorial en sí) como piezas sueltas que vienen de esa edición
//   (Ensayo, Cuento, Poema, Foto-Ensayo, Anuncio, etc.) y la fecha sola no
//   alcanza para distinguir cuál es cuál. Se usa "El Creativo" como mejor
//   valor por defecto (agrupa razonablemente en los dashboards de
//   newsletter) pero las piezas sueltas del viernes van a necesitar
//   corrección manual desde "Corregir datos" en /post/[slug].
// - Cualquier otro día: no hay patrón conocido, se devuelve null (sin
//   inferencia) en vez de adivinar.
const WEEKDAY_POST_TYPE: Partial<Record<number, LeaderboardPostType>> = {
  1: "Estelar", // lunes
  3: "Anteojos Editorial", // miércoles
  5: "El Creativo", // viernes (mejor esfuerzo, ver comentario arriba)
};

// publishedAt: fecha en formato "YYYY-MM-DD" (lo que devuelve parseDateValue).
export function inferPostTypeFromDate(publishedAt: string | null | undefined): LeaderboardPostType | null {
  if (!publishedAt) return null;
  const match = publishedAt.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (Number.isNaN(date.getTime())) return null;
  return WEEKDAY_POST_TYPE[date.getUTCDay()] ?? null;
}
