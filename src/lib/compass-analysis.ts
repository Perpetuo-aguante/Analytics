// Recibe la lectura que manda el agente para un texto (campo `analisis` de
// POST /api/ingest/texts), la valida y la guarda. Solo servidor.
//
// Reglas del spec que se aplican aquí:
// - Vocabularios cerrados (lib/compass-vocab.ts): un valor fuera de la lista
//   rechaza la lectura entera con un mensaje que dice qué corregir.
// - Regla de evidencia: cada cita tiene que existir literalmente en el texto
//   (comparando sin acentos, en minúsculas y con espacios colapsados). Si no,
//   el campo se guarda marcado `evidencia_invalida` y la respuesta le pide al
//   agente reintentarlo UNA vez (`reintentar`). Si el reintento tampoco
//   cuadra, queda marcado y no se vuelve a pedir.

import { queryOne, transaction } from "./db";
import { PROMPT_VERSION, THEMES, VOCAB } from "./compass-vocab";

export const DIMENSIONS = [
  "eje_x",
  "eje_y",
  "tesis",
  "figuracion",
  "intertextualidad",
  "lector_implicito",
  "apertura",
  "cierre",
  "temas",
] as const;
export type DimensionKey = (typeof DIMENSIONS)[number];

type Eje = { score: number; confianza: number; evidencia: string[]; justificacion: string | null };
type Reference = { autor: string; obra: string | null; tipo: string; tradicion: string; evidencia: string | null };
export type ParsedDims = {
  eje_x?: Eje;
  eje_y?: Eje;
  tesis?: { valor: string; evidencia: string | null; confianza: number };
  figuracion?: { polo: string; campos_semanticos: string[]; evidencia: string | null; confianza: number };
  intertextualidad?: { referencias: Reference[]; confianza: number };
  lector_implicito?: { dificultad: number; competencias: string[]; lector_modelo: string | null; confianza: number };
  apertura?: { tipo: string; fuerza: number; evidencia: string | null; confianza: number };
  cierre?: { tipo: string; evidencia: string | null; confianza: number };
  temas?: { tema: string; peso: number }[];
};
export type ParsedAnalysis = { modelo: string | null; dims: ParsedDims };

// ─────────────────────────────────────────────
// Validación
// ─────────────────────────────────────────────

class Checker {
  errors: string[] = [];

  obj(value: unknown, path: string): Record<string, unknown> | null {
    if (value == null || typeof value !== "object" || Array.isArray(value)) {
      this.errors.push(`\`${path}\` debe ser un objeto.`);
      return null;
    }
    return value as Record<string, unknown>;
  }

  num(value: unknown, path: string, min: number, max: number, integer = false): number {
    const n = typeof value === "number" ? value : Number(value);
    if (value == null || value === "" || !Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) {
      this.errors.push(`\`${path}\` debe ser un ${integer ? "entero" : "número"} entre ${min} y ${max} (llegó ${JSON.stringify(value)}).`);
      return min;
    }
    return integer ? n : Math.round(n * 1000) / 1000;
  }

  str(value: unknown, path: string, opts: { required?: boolean; max?: number } = {}): string | null {
    if (value == null || value === "") {
      if (opts.required) this.errors.push(`Falta \`${path}\`.`);
      return null;
    }
    if (typeof value !== "string") {
      this.errors.push(`\`${path}\` debe ser texto.`);
      return null;
    }
    return value.trim().slice(0, opts.max ?? 500) || null;
  }

  oneOf(value: unknown, path: string, allowed: readonly string[]): string {
    if (typeof value !== "string" || !allowed.includes(value)) {
      this.errors.push(`\`${path}\` debe ser uno de: ${allowed.map((a) => `"${a}"`).join(", ")} (llegó ${JSON.stringify(value)}).`);
      return allowed[0];
    }
    return value;
  }

  strList(value: unknown, path: string, min: number, max: number): string[] {
    if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
      this.errors.push(`\`${path}\` debe ser una lista de textos.`);
      return [];
    }
    const list = Array.from(new Set((value as string[]).map((v) => v.trim()).filter(Boolean)));
    if (list.length < min) this.errors.push(`\`${path}\` necesita al menos ${min} elementos.`);
    return list.slice(0, max);
  }
}

export function parseAnalysis(input: unknown): ParsedAnalysis {
  const c = new Checker();
  const raw = c.obj(input, "analisis");
  if (!raw) throw new Error(c.errors.join(" "));

  const known = new Set<string>([...DIMENSIONS, "modelo"]);
  const unknown = Object.keys(raw).filter((k) => !known.has(k));
  if (unknown.length > 0) c.errors.push(`Campos desconocidos en \`analisis\`: ${unknown.join(", ")}.`);

  const dims: ParsedDims = {};
  for (const axis of ["eje_x", "eje_y"] as const) {
    if (raw[axis] === undefined) continue;
    const o = c.obj(raw[axis], `analisis.${axis}`);
    if (!o) continue;
    // El spec pide 2 citas; si llegan repetidas o solo una, se acepta igual
    // (rechazar obligaría a reenviar la lectura entera: más tokens).
    const evidencia = c.strList(o.evidencia, `analisis.${axis}.evidencia`, 1, 2);
    dims[axis] = {
      score: c.num(o.score, `analisis.${axis}.score`, 0, 100, true),
      confianza: c.num(o.confianza, `analisis.${axis}.confianza`, 0, 1),
      evidencia,
      justificacion: c.str(o.justificacion, `analisis.${axis}.justificacion`, { max: 400 }),
    };
  }
  if (raw.tesis !== undefined) {
    const o = c.obj(raw.tesis, "analisis.tesis");
    if (o)
      dims.tesis = {
        valor: c.oneOf(o.valor, "analisis.tesis.valor", VOCAB.tesis),
        evidencia: c.str(o.evidencia, "analisis.tesis.evidencia"),
        confianza: c.num(o.confianza, "analisis.tesis.confianza", 0, 1),
      };
  }
  if (raw.figuracion !== undefined) {
    const o = c.obj(raw.figuracion, "analisis.figuracion");
    if (o)
      dims.figuracion = {
        polo: c.oneOf(o.polo, "analisis.figuracion.polo", VOCAB.polo_dominante),
        campos_semanticos: c.strList(o.campos_semanticos, "analisis.figuracion.campos_semanticos", 1, 5),
        evidencia: c.str(o.evidencia, "analisis.figuracion.evidencia"),
        confianza: c.num(o.confianza, "analisis.figuracion.confianza", 0, 1),
      };
  }
  if (raw.intertextualidad !== undefined) {
    const o = c.obj(raw.intertextualidad, "analisis.intertextualidad");
    if (o) {
      const refs = Array.isArray(o.referencias) ? o.referencias : (c.errors.push("`analisis.intertextualidad.referencias` debe ser una lista (vacía si no hay)."), []);
      dims.intertextualidad = {
        referencias: refs.slice(0, 20).map((r: unknown, i: number) => {
          const p = `analisis.intertextualidad.referencias[${i}]`;
          const ro = c.obj(r, p) ?? {};
          return {
            autor: c.str(ro.autor, `${p}.autor`, { required: true, max: 120 }) ?? "",
            obra: c.str(ro.obra, `${p}.obra`, { max: 200 }),
            tipo: c.oneOf(ro.tipo, `${p}.tipo`, VOCAB.tipo_referencia),
            tradicion: c.oneOf(ro.tradicion, `${p}.tradicion`, VOCAB.tradicion),
            evidencia: c.str(ro.evidencia, `${p}.evidencia`),
          };
        }),
        confianza: c.num(o.confianza, "analisis.intertextualidad.confianza", 0, 1),
      };
    }
  }
  if (raw.lector_implicito !== undefined) {
    const o = c.obj(raw.lector_implicito, "analisis.lector_implicito");
    if (o)
      dims.lector_implicito = {
        dificultad: c.num(o.dificultad, "analisis.lector_implicito.dificultad", 1, 5, true),
        competencias: o.competencias == null ? [] : c.strList(o.competencias, "analisis.lector_implicito.competencias", 0, 8),
        lector_modelo: c.str(o.lector_modelo, "analisis.lector_implicito.lector_modelo", { max: 300 }),
        confianza: c.num(o.confianza, "analisis.lector_implicito.confianza", 0, 1),
      };
  }
  if (raw.apertura !== undefined) {
    const o = c.obj(raw.apertura, "analisis.apertura");
    if (o)
      dims.apertura = {
        tipo: c.oneOf(o.tipo, "analisis.apertura.tipo", VOCAB.tipo_gancho),
        fuerza: c.num(o.fuerza, "analisis.apertura.fuerza", 1, 5, true),
        evidencia: c.str(o.evidencia, "analisis.apertura.evidencia"),
        confianza: c.num(o.confianza, "analisis.apertura.confianza", 0, 1),
      };
  }
  if (raw.cierre !== undefined) {
    const o = c.obj(raw.cierre, "analisis.cierre");
    if (o)
      dims.cierre = {
        tipo: c.oneOf(o.tipo, "analisis.cierre.tipo", VOCAB.cierre),
        evidencia: c.str(o.evidencia, "analisis.cierre.evidencia"),
        confianza: c.num(o.confianza, "analisis.cierre.confianza", 0, 1),
      };
  }
  if (raw.temas !== undefined) {
    if (!Array.isArray(raw.temas) || raw.temas.length === 0) {
      c.errors.push("`analisis.temas` debe ser una lista de 1 a 5 temas.");
    } else {
      const seen = new Set<string>();
      dims.temas = [];
      raw.temas.slice(0, 5).forEach((t: unknown, i: number) => {
        const o = c.obj(t, `analisis.temas[${i}]`);
        if (!o) return;
        const tema = c.oneOf(o.tema, `analisis.temas[${i}].tema`, Object.keys(THEMES));
        const peso = c.num(o.peso, `analisis.temas[${i}].peso`, 0, 1);
        if (!seen.has(tema)) {
          seen.add(tema);
          dims.temas!.push({ tema, peso });
        }
      });
    }
  }

  if (Object.keys(dims).length === 0 && c.errors.length === 0) c.errors.push("`analisis` no trae ninguna dimensión.");
  if (c.errors.length > 0) throw new Error(c.errors.slice(0, 12).join(" "));
  return { modelo: c.str(raw.modelo, "analisis.modelo", { max: 80 }), dims };
}

// ─────────────────────────────────────────────
// Evidencia
// ─────────────────────────────────────────────

export function normalizeForMatch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[“”«»„]/g, '"')
    .replace(/[‘’´]/g, "'")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function quoteExists(haystack: string, quote: string | null | undefined): boolean {
  if (!quote) return false;
  const needle = normalizeForMatch(quote).replace(/^[\s"'.,;:]+|[\s"'.,;:]+$/g, "");
  return needle.length >= 3 && haystack.includes(needle);
}

function dimensionQuotes(key: DimensionKey, dim: ParsedDims[DimensionKey]): (string | null)[] {
  if (!dim) return [];
  switch (key) {
    case "eje_x":
    case "eje_y":
      return (dim as Eje).evidencia;
    case "intertextualidad":
      return (dim as NonNullable<ParsedDims["intertextualidad"]>).referencias.map((r) => r.evidencia);
    case "lector_implicito":
    case "temas":
      return [];
    default:
      return [(dim as { evidencia: string | null }).evidencia];
  }
}

// ─────────────────────────────────────────────
// Guardar
// ─────────────────────────────────────────────

type StoredDim = Record<string, unknown> & { evidencia_invalida?: boolean; reintentos?: number };

export type SaveAnalysisResult = {
  estado: "guardado" | "actualizado";
  // Campos con una cita que no está en el texto.
  invalidos: string[];
  // Los que el agente debe volver a mandar (los inválidos que no se han
  // reintentado todavía).
  reintentar: string[];
};

export async function savePostAnalysis(
  postId: string,
  contentHash: string,
  body: string,
  parsed: ParsedAnalysis
): Promise<SaveAnalysisResult> {
  const existing = await queryOne<{ content_hash: string; prompt_version: string; dimensiones: Record<string, StoredDim>; modelo: string | null }>(
    "select content_hash, prompt_version, dimensiones, modelo from post_compass where post_id = $1",
    [postId]
  );
  // Lo ya guardado solo vale si es de este mismo texto y de esta versión de la guía.
  const base = existing && existing.content_hash === contentHash && existing.prompt_version === PROMPT_VERSION ? existing.dimensiones : {};

  const missing = DIMENSIONS.filter((d) => parsed.dims[d] === undefined && base[d] === undefined);
  if (missing.length > 0) {
    throw new Error(
      `Falta ${missing.map((m) => `\`${m}\``).join(", ")} en \`analisis\`. La primera lectura de un texto trae todas las dimensiones; después se pueden mandar solo las que se corrigen.`
    );
  }

  const haystack = normalizeForMatch(body);
  const merged: Record<string, StoredDim> = { ...base };
  for (const key of DIMENSIONS) {
    const dim = parsed.dims[key];
    if (dim === undefined) continue;
    const quotes = dimensionQuotes(key, dim);
    const invalid = quotes.some((q) => !quoteExists(haystack, q));
    const previous = base[key];
    const stored: StoredDim =
      key === "temas" ? { temas: dim } : { ...(dim as Record<string, unknown>) };
    if (key === "intertextualidad") {
      stored.referencias = (dim as NonNullable<ParsedDims["intertextualidad"]>).referencias.map((r) => ({
        ...r,
        evidencia_invalida: !quoteExists(haystack, r.evidencia),
      }));
    }
    stored.evidencia_invalida = invalid;
    stored.reintentos = previous ? (previous.reintentos ?? 0) + (previous.evidencia_invalida ? 1 : 0) : 0;
    merged[key] = stored;
  }

  const invalidos = DIMENSIONS.filter((d) => merged[d]?.evidencia_invalida);
  const reintentar = invalidos.filter((d) => (merged[d]?.reintentos ?? 0) < 1);

  const x = merged.eje_x as unknown as Eje;
  const y = merged.eje_y as unknown as Eje;
  const get = (d: DimensionKey, field: string) => (merged[d] as Record<string, unknown>)[field] ?? null;

  const statements: { text: string; params?: unknown[] }[] = [
    {
      text: `insert into post_compass (post_id, content_hash, prompt_version, modelo, compass_x, compass_x_confianza,
               compass_y, compass_y_confianza, tesis, polo_dominante, dificultad, tipo_gancho, fuerza_gancho, cierre,
               dimensiones, campos_evidencia_invalida, analyzed_at)
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $16, now())
             on conflict (post_id) do update set content_hash = excluded.content_hash,
               prompt_version = excluded.prompt_version, modelo = excluded.modelo, compass_x = excluded.compass_x,
               compass_x_confianza = excluded.compass_x_confianza, compass_y = excluded.compass_y,
               compass_y_confianza = excluded.compass_y_confianza, tesis = excluded.tesis,
               polo_dominante = excluded.polo_dominante, dificultad = excluded.dificultad,
               tipo_gancho = excluded.tipo_gancho, fuerza_gancho = excluded.fuerza_gancho, cierre = excluded.cierre,
               dimensiones = excluded.dimensiones, campos_evidencia_invalida = excluded.campos_evidencia_invalida,
               analyzed_at = now()`,
      params: [
        postId,
        contentHash,
        PROMPT_VERSION,
        parsed.modelo ?? existing?.modelo ?? null,
        x.score,
        x.confianza,
        y.score,
        y.confianza,
        get("tesis", "valor"),
        get("figuracion", "polo"),
        get("lector_implicito", "dificultad"),
        get("apertura", "tipo"),
        get("apertura", "fuerza"),
        get("cierre", "tipo"),
        JSON.stringify(merged),
        invalidos,
      ],
    },
  ];
  if (parsed.dims.temas) {
    statements.push({ text: "delete from post_themes where post_id = $1", params: [postId] });
    for (const t of parsed.dims.temas) {
      statements.push({ text: "insert into post_themes (post_id, tema, peso) values ($1, $2, $3)", params: [postId, t.tema, t.peso] });
    }
  }
  if (parsed.dims.intertextualidad) {
    statements.push({ text: "delete from post_references where post_id = $1", params: [postId] });
    for (const r of merged.intertextualidad.referencias as (Reference & { evidencia_invalida: boolean })[]) {
      statements.push({
        text: `insert into post_references (post_id, autor, obra, tipo, tradicion, evidencia, evidencia_invalida)
               values ($1, $2, $3, $4, $5, $6, $7)`,
        params: [postId, r.autor, r.obra, r.tipo, r.tradicion, r.evidencia, r.evidencia_invalida],
      });
    }
  }
  await transaction(statements);
  return { estado: existing ? "actualizado" : "guardado", invalidos, reintentar };
}

// El texto guardado de un post (para validar una lectura que llega sin texto).
export function getStoredText(postId: string): Promise<{ body: string; content_hash: string } | null> {
  return queryOne("select body, content_hash from post_texts where post_id = $1", [postId]);
}

