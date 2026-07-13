// Diccionario de alias de columnas: mapea nombres de columnas en español o
// inglés (como vengan en el Excel/CSV del usuario) a los campos internos
// del modelo de datos. Se usa para sugerir el mapeo automáticamente; el
// usuario siempre puede corregirlo a mano en la pantalla de revisión.

export type FieldKey =
  | "title"
  | "author"
  | "published_at"
  | "post_type"
  | "views"
  | "new_subscribers"
  | "open_rate"
  | "click_to_open_rate"
  | "engagement";

export const FIELD_ORDER: FieldKey[] = [
  "title",
  "author",
  "published_at",
  "post_type",
  "views",
  "new_subscribers",
  "open_rate",
  "click_to_open_rate",
  "engagement",
];

export const FIELD_LABELS: Record<FieldKey, string> = {
  title: "Título del post",
  author: "Autor / subtítulo",
  published_at: "Fecha de publicación",
  post_type: "Tipo de post",
  views: "Views",
  new_subscribers: "Nuevos suscriptores",
  open_rate: "Open rate",
  click_to_open_rate: "Click-to-open rate",
  engagement: "Engagement",
};

// Campos sin los que no se puede identificar un post de forma estable.
export const REQUIRED_FIELDS: FieldKey[] = ["title"];

// En el export de Substack que usamos, "post_id" trae el título real y la
// columna "title" trae en realidad el subtítulo o el nombre del autor. Por
// eso las sugerencias automáticas están invertidas a propósito.
const ALIASES: Record<FieldKey, string[]> = {
  title: ["titulo", "titulo del post", "nombre del post", "post id", "id del post"],
  author: ["autor", "author", "subtitulo", "subtitulo del post", "subtitle", "nombre del autor", "title", "post title"],
  published_at: [
    "fecha",
    "fecha de publicacion",
    "fecha publicacion",
    "publish date",
    "published date",
    "date",
    "post date",
  ],
  post_type: ["tipo", "tipo de post", "post type", "type", "formato"],
  views: ["views", "visits", "vistas", "visitas", "visualizaciones", "pageviews", "page views"],
  new_subscribers: [
    "nuevos suscriptores",
    "new subscribers",
    "suscriptores nuevos",
    "subs nuevos",
    "new subs",
    "nuevos subs",
    "suscriptores",
  ],
  open_rate: ["open rate", "tasa de apertura", "openrate", "tasa apertura"],
  click_to_open_rate: [
    "click to open rate",
    "click-to-open rate",
    "ctor",
    "cto rate",
    "tasa de clics sobre apertura",
    "click to open",
  ],
  engagement: ["engagement", "interaccion", "engagement rate", "interaccion rate", "tasa de interaccion"],
};

// Normaliza un encabezado para comparar sin importar acentos, mayúsculas,
// guiones o espacios extra: "Fecha de Publicación" y "fecha_publicacion"
// terminan siendo la misma cadena.
export function normalizeHeader(header: string): string {
  return header
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function suggestMapping(headers: string[]): Record<FieldKey, string | null> {
  const normalized = headers.map((raw) => ({ raw, norm: normalizeHeader(raw) }));
  const result = {} as Record<FieldKey, string | null>;
  for (const field of FIELD_ORDER) {
    const match = normalized.find((h) => ALIASES[field].includes(h.norm));
    result[field] = match ? match.raw : null;
  }
  return result;
}
