// Lógica que combina las categorías de post (lib/categories.ts, ahora en
// base de datos) con datos de texto libre: matchear el post_type crudo del
// CSV contra una categoría, e inferir por día de la semana cuando el CSV no
// trae tipo.

import { normalizeHeader } from "./columns";
import type { Category } from "./categories";

// "321 Editorial" fue el nombre de "El Creativo" antes del rebranding: los
// CSVs viejos siguen trayendo el nombre viejo, y deben agruparse junto con
// los nuevos en vez de quedar afuera de los leaderboards y timelines por
// tipo (ver migración 0004).
const HISTORICAL_ALIASES: Record<string, string> = {
  "321 editorial": "el creativo",
};

// post_type es texto libre cargado desde el CSV/edición manual: puede traer
// mayúsculas, acentos o separadores distintos al nombre canónico guardado en
// post_categories. Devuelve la categoría (o null si no matchea ninguna).
export function matchPostType(postType: string | null | undefined, categories: Category[]): Category | null {
  if (!postType) return null;
  const normalized = normalizeHeader(postType);
  const target = HISTORICAL_ALIASES[normalized] ?? normalized;
  return categories.find((c) => normalizeHeader(c.name) === target) ?? null;
}

export function categoryBySlug(categories: Category[], slug: string): Category | null {
  const target = slug.toLowerCase();
  return categories.find((c) => c.slug === target) ?? null;
}

// Los tipos que efectivamente se envían por newsletter (a diferencia de
// contenido que solo vive en el sitio). Se usa para los dashboards que
// siguen la evolución del envío semanal (open rate, views acumuladas). Es un
// criterio fijo — qué se manda por mail — y no depende de qué categorías
// existan hoy, así que se queda como lista de nombres en vez de venir de la
// base.
export const NEWSLETTER_POST_TYPE_NAMES = ["Estelar", "El Creativo", "Anteojos Editorial"];

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
const WEEKDAY_POST_TYPE: Partial<Record<number, string>> = {
  1: "Estelar", // lunes
  3: "Anteojos Editorial", // miércoles
  5: "El Creativo", // viernes (mejor esfuerzo, ver comentario arriba)
};

// publishedAt: fecha en formato "YYYY-MM-DD" (lo que devuelve parseDateValue).
export function inferPostTypeFromDate(publishedAt: string | null | undefined): string | null {
  if (!publishedAt) return null;
  const match = publishedAt.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (Number.isNaN(date.getTime())) return null;
  return WEEKDAY_POST_TYPE[date.getUTCDay()] ?? null;
}

// Etiqueta corta para los chips de filtro, donde el ancho importa. Solo
// difiere del nombre canónico cuando este es demasiado largo para un chip.
const SHORT_LABEL_OVERRIDES: Record<string, string> = {
  "anteojos editorial": "Anteojos",
  "foto-ensayo": "Foto",
};

export function categoryShortLabel(category: Category): string {
  return SHORT_LABEL_OVERRIDES[normalizeHeader(category.name)] ?? category.name;
}
