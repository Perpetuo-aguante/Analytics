// Funciones puras de parseo/formateo. No usan APIs de Node, así que son
// seguras de importar tanto en Server Components/Actions como en
// componentes cliente (ej. para mostrar la vista previa del mapeo).

export function slugify(input: string): string {
  const slug = input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 200);
  return slug || "post";
}

// Clave natural de un post: el último segmento de la URL (que en Substack
// suele ser el slug real del post, ej. ".../p/mi-post" -> "mi-post").
// Si la URL no es válida, cae en generar el slug a partir del título.
export function deriveSlug(url: string, title: string): string {
  try {
    const parsed = new URL(url.trim());
    const segments = parsed.pathname.split("/").filter(Boolean);
    const last = segments[segments.length - 1];
    if (last) return slugify(decodeURIComponent(last));
  } catch {
    // URL inválida o vacía: seguimos con el título.
  }
  return slugify(title);
}

// Convierte el valor crudo de una celda (string, número, Date, o el objeto
// de celda de una librería de Excel) a texto simple.
export function cellToString(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (typeof v.text === "string") return v.text.trim() || null;
    if (Array.isArray(v.richText)) {
      const text = (v.richText as Array<{ text?: string }>).map((rt) => rt.text ?? "").join("");
      return text.trim() || null;
    }
    if (v.result != null) return String(v.result).trim() || null;
    if (typeof v.hyperlink === "string") return v.hyperlink;
    return null;
  }
  const text = String(value).trim();
  return text || null;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// Valida año/mes/día y devuelve "YYYY-MM-DD", o null si la combinación no
// existe (ej. 31 de febrero) — evita que new Date() "corrija" fechas
// inválidas silenciosamente hacia otro mes/día.
function toIsoDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

// Fechas: acepta un objeto Date (celdas con formato fecha en Excel), un
// número (fecha serial de Excel) o un texto. Devuelve siempre "YYYY-MM-DD"
// o null si no se pudo interpretar.
//
// El texto se parsea a mano (sin new Date(text)) porque para formatos con
// "/" o "-" de tres números, new Date() asume el formato estadounidense
// MM/DD/YYYY: una fecha como "01/07/2026" (1 de julio, como la escribiría
// cualquiera acá) se leía como 7 de enero. Como esto depende del día
// (día ≤ 12 se interpretaba mal; día > 12 fallaba o quedaba bien por
// casualidad), el filtro por rango de fechas "se rompía" solo para algunos
// posts y no para otros. Acá el día siempre va primero (DD/MM/YYYY), salvo
// que el primer número tenga 4 dígitos (YYYY-MM-DD / YYYY/MM/DD).
export function parseDateValue(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }
  if (typeof value === "number") {
    const ms = Math.round((value - 25569) * 86400 * 1000); // época Excel -> Unix
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
  }
  const text = String(value).trim();
  if (!text) return null;

  const numeric = text.match(/^(\d{1,4})[/\-.](\d{1,2})[/\-.](\d{1,4})$/);
  if (numeric) {
    const [, a, b, c] = numeric;
    if (a.length === 4) {
      // YYYY-MM-DD
      return toIsoDate(Number(a), Number(b), Number(c));
    }
    // DD-MM-YYYY (día primero)
    return toIsoDate(Number(c), Number(b), Number(a));
  }

  // Formatos con nombre de mes (ej. "1 de julio de 2026", "July 1, 2026"):
  // no son ambiguos, así que el parser nativo es seguro acá.
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

// Enteros: acepta "1,234", "1234", 1234.0, etc.
export function parseIntValue(value: unknown): number | null {
  if (value == null || value === "") return null;
  const text = String(value).replace(/[,\s]/g, "");
  const num = Number(text);
  return Number.isFinite(num) ? Math.round(num) : null;
}

// Tasas (open rate, CTOR, engagement): acepta "45%", "45", "0.45" y las
// normaliza siempre a fracción (0.45).
// - Si el texto trae "%", ese signo es la fuente de verdad: siempre se
//   divide entre 100 ("45%" -> 0.45, y también "0.4%" -> 0.004; antes,
//   un valor con "%" menor o igual a 1 se dejaba tal cual y quedaba 100x
//   inflado, ej. "0.4%" se mostraba como 40% en vez de 0.4%).
// - Sin "%", no hay forma de distinguir "0.45" (ya es fracción) de "45"
//   (viene como porcentaje entero), así que ahí sí asumimos por magnitud:
//   mayor a 1 se divide entre 100.
export function parseRateValue(value: unknown): number | null {
  if (value == null || value === "") return null;
  const raw = String(value).trim();
  const hasPercentSign = raw.includes("%");
  const num = Number(raw.replace("%", ""));
  if (!Number.isFinite(num)) return null;
  return hasPercentSign || num > 1 ? num / 100 : num;
}
