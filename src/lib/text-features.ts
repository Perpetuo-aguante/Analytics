// Estilometría mínima de un texto: rasgos baratos, deterministas y sin
// modelos (versión lean del spec, que pedía spaCy). Se calculan al guardar el
// texto y se guardan en post_texts.features. No buscan describir el estilo a
// fondo: sirven para ANCLAR el compass, es decir, para avisar cuando el score
// que puso el LLM contradice lo que dicen los números (lib/compass.ts).
//
// Puro (sin APIs de Node).

export const FEATURE_KEYS = [
  "oracion_long_media",
  "oracion_long_cv",
  "primera_persona",
  "densidad_referencial",
  "ratio_interrogativas",
  "ratio_dialogo",
  "densidad_citas",
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];
export type TextFeatures = Record<FeatureKey, number | null> & { oraciones: number; parrafos: number };

export const FEATURE_LABELS: Record<FeatureKey, { label: string; hint: string }> = {
  oracion_long_media: { label: "Longitud de oración", hint: "palabras por oración, media" },
  oracion_long_cv: { label: "Variación de la oración", hint: "coef. de variación; alto = ritmo irregular, más poético" },
  primera_persona: { label: "Primera persona", hint: "yo, me, mí, mi, nos, nuestro… cada 100 palabras" },
  densidad_referencial: { label: "Densidad referencial", hint: "cifras, fechas, porcentajes y nombres propios cada 100 palabras" },
  ratio_interrogativas: { label: "Preguntas", hint: "oraciones interrogativas / oraciones" },
  ratio_dialogo: { label: "Diálogo", hint: "líneas de diálogo / párrafos" },
  densidad_citas: { label: "Citas", hint: "fragmentos citados / párrafos" },
};

const WORD_RE = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;
const FIRST_PERSON = new Set([
  "yo", "me", "mí", "mi", "mis", "conmigo", "nosotros", "nosotras", "nos",
  "nuestro", "nuestra", "nuestros", "nuestras",
]);
const MONTHS = "enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre";
const DATE_RE = new RegExp(`\\b\\d{1,2}\\s+de\\s+(?:${MONTHS})(?:\\s+(?:de|del)\\s+\\d{4})?\\b|\\b(?:${MONTHS})\\s+(?:de|del)\\s+\\d{4}\\b`, "giu");
const PERCENT_RE = /\d+(?:[.,]\d+)?\s?%|\d+(?:[.,]\d+)?\s+por\s+ciento/giu;
const NUMBER_RE = /\b\d[\d.,]*\b/gu;
// Palabra con mayúscula que NO abre oración: un nombre propio, casi siempre.
const PROPER_RE = /(?<=[\p{Ll},;:)]\s+)\p{Lu}[\p{Ll}\p{Lu}]+/gu;
const QUOTE_RE = /[«“"]([^«»“”"]{3,}?)[»”"]/gu;

function paragraphs(text: string): string[] {
  const sep = /\n[ \t]*\n/.test(text) ? /\n[ \t]*\n/ : /\n/;
  return text.split(sep).map((p) => p.trim()).filter(Boolean);
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])["»”)]*\s+|\n+/u)
    .map((s) => s.trim())
    .filter((s) => (s.match(WORD_RE)?.length ?? 0) > 0);
}

function countMatches(text: string, re: RegExp): number {
  return text.match(re)?.length ?? 0;
}

export function computeFeatures(text: string): TextFeatures {
  const paras = paragraphs(text);
  const sents = sentences(text);
  const words = text.match(WORD_RE) ?? [];
  const lengths = sents.map((s) => s.match(WORD_RE)?.length ?? 0);
  const mean = lengths.length > 0 ? lengths.reduce((a, b) => a + b, 0) / lengths.length : null;
  const sd =
    mean != null && lengths.length > 1
      ? Math.sqrt(lengths.reduce((acc, l) => acc + (l - mean) ** 2, 0) / lengths.length)
      : null;

  // Fechas y porcentajes se cuentan una vez cada uno; las cifras sueltas son
  // las que quedan fuera de ellos.
  const withoutDates = text.replace(DATE_RE, " ").replace(PERCENT_RE, " ");
  const references =
    countMatches(text, DATE_RE) +
    countMatches(text, PERCENT_RE) +
    countMatches(withoutDates, NUMBER_RE) +
    countMatches(text, PROPER_RE);

  const per = (n: number, d: number, scale = 1) => (d > 0 ? (n / d) * scale : null);
  return {
    oraciones: sents.length,
    parrafos: paras.length,
    oracion_long_media: mean,
    oracion_long_cv: mean && sd != null ? sd / mean : null,
    primera_persona: per(words.filter((w) => FIRST_PERSON.has(w.toLowerCase())).length, words.length, 100),
    densidad_referencial: per(references, words.length, 100),
    ratio_interrogativas: per(sents.filter((s) => s.includes("?")).length, sents.length),
    ratio_dialogo: per(paras.filter((p) => /^(?:[—–]|-\s|[«“"])/u.test(p)).length, paras.length),
    densidad_citas: per(
      [...text.matchAll(QUOTE_RE)].filter((m) => m[1].trim().split(/\s+/).length >= 3).length +
        paras.filter((p) => p.startsWith(">")).length,
      paras.length
    ),
  };
}
