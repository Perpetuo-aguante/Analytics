// Lectura del compass editorial y del análisis literario que escribe el
// worker de Python (analysis/). La app no escribe en estas tablas. Solo
// servidor.

import { query, queryOne } from "./db";
import { THEMES } from "./compass-vocab";

export const STYLOMETRY_FEATURES = [
  "oracion_long_media",
  "oracion_long_cv",
  "mtld",
  "densidad_lexica",
  "ratio_primera_persona",
  "densidad_referencial",
  "densidad_adjetival",
  "profundidad_sintactica",
  "ratio_subordinacion",
  "densidad_citas",
  "ratio_dialogo",
  "ratio_interrogativas",
] as const;
export type StylometryFeature = (typeof STYLOMETRY_FEATURES)[number];

export const FEATURE_LABELS: Record<StylometryFeature, { label: string; hint: string }> = {
  oracion_long_media: { label: "Longitud de oración", hint: "tokens por oración, media" },
  oracion_long_cv: { label: "Variación de la oración", hint: "coef. de variación; alto = ritmo irregular, prosa poética" },
  mtld: { label: "Riqueza léxica (MTLD)", hint: "diversidad de vocabulario, independiente de la longitud" },
  densidad_lexica: { label: "Densidad léxica", hint: "palabras de contenido / tokens" },
  ratio_primera_persona: { label: "Primera persona", hint: "verbos en 1.ª persona + yo, me, mí, conmigo, nosotros / verbos" },
  densidad_referencial: { label: "Densidad referencial", hint: "entidades, cifras, fechas y porcentajes cada 100 tokens" },
  densidad_adjetival: { label: "Densidad adjetival", hint: "adjetivos / sustantivos" },
  profundidad_sintactica: { label: "Profundidad sintáctica", hint: "profundidad del árbol de dependencias por oración" },
  ratio_subordinacion: { label: "Subordinación", hint: "cláusulas subordinadas por oración" },
  densidad_citas: { label: "Citas", hint: "fragmentos citados / párrafos" },
  ratio_dialogo: { label: "Diálogo", hint: "líneas de diálogo / párrafos" },
  ratio_interrogativas: { label: "Preguntas", hint: "oraciones interrogativas / oraciones" },
};

// Por debajo de esta confianza en un eje, el punto se dibuja atenuado.
export const CONFIDENCE_FLOOR = 0.5;

export type Norms = Partial<Record<StylometryFeature, { media: number; desviacion: number; corpus_size: number }>>;

export async function getNorms(): Promise<Norms> {
  const rows = await query<{ feature: StylometryFeature; media: number; desviacion: number; corpus_size: number }>(
    "select feature, media, desviacion, corpus_size from stylometry_norms"
  );
  return Object.fromEntries(rows.map((r) => [r.feature, r]));
}

export function zScore(norms: Norms, feature: StylometryFeature, value: number | null): number | null {
  const n = norms[feature];
  if (value == null || !n || !n.desviacion) return null;
  return (value - n.media) / n.desviacion;
}

type Features = Record<StylometryFeature, number | null>;

// La capa 1 sirve para detectar cuando el LLM alucina: si lo que puntuó en un
// eje contradice de frente lo que miden los números, se avisa. Son alertas,
// no correcciones: la ficción en tercera persona con focalización interna,
// por ejemplo, puede ser muy subjetiva con poca primera persona.
export function anchorAlerts(
  row: { compass_x: number | null; compass_y: number | null } & Partial<Features>,
  norms: Norms
): string[] {
  const alerts: string[] = [];
  const ref = zScore(norms, "densidad_referencial", row.densidad_referencial ?? null);
  const yo = zScore(norms, "ratio_primera_persona", row.ratio_primera_persona ?? null);
  if (row.compass_x != null && ref != null) {
    if (row.compass_x >= 75 && ref >= 1) alerts.push("Eje X muy poético, pero con densidad referencial alta (muchos datos, fechas y nombres).");
    if (row.compass_x <= 25 && ref <= -1) alerts.push("Eje X muy referencial, pero con densidad referencial baja (pocos datos, fechas y nombres).");
  }
  if (row.compass_y != null && yo != null) {
    if (row.compass_y >= 75 && yo <= -1) alerts.push("Eje Y muy subjetivo, pero con poca primera persona.");
    if (row.compass_y <= 25 && yo >= 1) alerts.push("Eje Y muy impersonal, pero con mucha primera persona.");
  }
  return alerts;
}

// ─────────────────────────────────────────────
// Corpus: un registro por post analizado
// ─────────────────────────────────────────────

export type CompassRow = Features & {
  post_id: string;
  slug: string;
  title: string;
  published_at: string | null;
  post_type: string | null;
  extra_post_types: string[];
  compass_x: number;
  compass_y: number;
  compass_x_confianza: number;
  compass_y_confianza: number;
  narrador: string | null;
  focalizacion: string | null;
  distancia_narrativa: string | null;
  contraparte: string | null;
  orden_temporal: string | null;
  ritmo_dominante: string | null;
  tesis: string | null;
  estructura: string | null;
  autoridad: string | null;
  polo_dominante: string | null;
  dificultad: number | null;
  tipo_gancho: string | null;
  fuerza_gancho: number | null;
  cierre: string | null;
  campos_evidencia_invalida: string[];
  arco: string | null;
  valencia_media: number | null;
  activacion_media: number | null;
  distancia_afectiva: string | null;
  ironia: boolean | null;
  // Emoción dominante del post: la de más tokens entre sus párrafos.
  emocion_principal: string | null;
  temas: { tema: string; peso: number }[];
  views: number | null;
  open_rate: number | null;
  new_subscribers: number | null;
  engagement: number | null;
};

export function getCompassCorpus(): Promise<CompassRow[]> {
  return query<CompassRow>(
    `select p.id as post_id, p.slug, p.title, p.published_at, p.post_type, p.extra_post_types,
            l.compass_x, l.compass_y, l.compass_x_confianza, l.compass_y_confianza,
            l.narrador, l.focalizacion, l.distancia_narrativa, l.contraparte, l.orden_temporal, l.ritmo_dominante,
            l.tesis, l.estructura, l.autoridad, l.polo_dominante, l.dificultad, l.tipo_gancho, l.fuerza_gancho,
            l.cierre, l.campos_evidencia_invalida,
            a.arco, a.valencia_media, a.activacion_media, a.distancia_afectiva, a.ironia,
            (select pp.emocion_dominante from post_paragraphs pp
              where pp.post_id = p.id and pp.emocion_dominante is not null
              group by pp.emocion_dominante order by sum(pp.token_count) desc limit 1) as emocion_principal,
            coalesce((select json_agg(json_build_object('tema', th.tema, 'peso', th.peso) order by th.peso desc)
              from post_themes th where th.post_id = p.id), '[]'::json) as temas,
            ${STYLOMETRY_FEATURES.map((f) => `s.${f}`).join(", ")},
            m.views, m.open_rate, m.new_subscribers, m.engagement
     from post_literary l
     join posts p on p.id = l.post_id
     left join post_affect a on a.post_id = l.post_id
     left join post_stylometry s on s.post_id = l.post_id
     left join current_metrics m on m.post_id = l.post_id
     order by p.published_at desc nulls last`
  );
}

export async function countPendingAnalysis(): Promise<{ texts: number; pending: number }> {
  const row = await queryOne<{ texts: number; pending: number }>(
    `select count(*) as texts,
            count(*) filter (where l.post_id is null or l.content_hash <> t.content_hash) as pending
     from post_texts t left join post_literary l on l.post_id = t.post_id`
  );
  return row ?? { texts: 0, pending: 0 };
}

// ─────────────────────────────────────────────
// Un post: todo el detalle
// ─────────────────────────────────────────────

export type Dimension = Record<string, unknown> & { evidencia?: string; confianza?: number; evidencia_invalida?: boolean };

export type LiteraryDetail = {
  content_hash: string;
  modelo: string;
  prompt_version: string;
  compass_x: number;
  compass_y: number;
  compass_x_confianza: number;
  compass_y_confianza: number;
  dimensiones: Record<string, Dimension>;
  campos_evidencia_invalida: string[];
  secciones: number;
  analyzed_at: string;
};

export type AffectDetail = {
  arco: string | null;
  arco_ajuste: number | null;
  valencia_media: number | null;
  activacion_media: number | null;
  rango_valencia: number | null;
  distancia_afectiva: string | null;
  distancia_evidencia: string | null;
  distancia_confianza: number | null;
  ironia: boolean | null;
  ironia_evidencia: string[] | null;
  ironia_confianza: number | null;
};

export type ParagraphDetail = {
  idx: number;
  char_start: number;
  char_end: number;
  token_count: number;
  valencia_baseline: number | null;
  valencia_llm: number | null;
  activacion: number | null;
  emocion_baseline: string | null;
  emocion_llm: string | null;
  emocion_dominante: string | null;
  emocion_fuente: string | null;
};

export type ReferenceDetail = {
  autor: string;
  obra: string | null;
  tipo: string;
  tradicion: string;
  evidencia: string | null;
  evidencia_invalida: boolean;
};

export type PostAnalysis = {
  literary: LiteraryDetail | null;
  affect: AffectDetail | null;
  paragraphs: ParagraphDetail[];
  themes: { tema: string; nombre: string; peso: number }[];
  references: ReferenceDetail[];
  stylometry: (Features & { longitud_tokens: number; num_oraciones: number; num_parrafos: number; content_hash: string }) | null;
  norms: Norms;
};

export async function getPostAnalysis(postId: string): Promise<PostAnalysis> {
  const [literary, affect, paragraphs, themes, references, stylometry, norms] = await Promise.all([
    queryOne<LiteraryDetail>(
      `select content_hash, modelo, prompt_version, compass_x, compass_y, compass_x_confianza, compass_y_confianza,
              dimensiones, campos_evidencia_invalida, secciones, analyzed_at
       from post_literary where post_id = $1`,
      [postId]
    ),
    queryOne<AffectDetail>(
      `select arco, arco_ajuste, valencia_media, activacion_media, rango_valencia, distancia_afectiva,
              distancia_evidencia, distancia_confianza, ironia, ironia_evidencia, ironia_confianza
       from post_affect where post_id = $1`,
      [postId]
    ),
    query<ParagraphDetail>(
      `select idx, char_start, char_end, token_count, valencia_baseline, valencia_llm, activacion,
              emocion_baseline, emocion_llm, emocion_dominante, emocion_fuente
       from post_paragraphs where post_id = $1 order by idx`,
      [postId]
    ),
    query<{ tema: string; peso: number }>("select tema, peso from post_themes where post_id = $1 order by peso desc", [postId]),
    query<ReferenceDetail>(
      "select autor, obra, tipo, tradicion, evidencia, evidencia_invalida from post_references where post_id = $1 order by autor",
      [postId]
    ),
    queryOne<PostAnalysis["stylometry"] & object>(
      `select content_hash, longitud_tokens, num_oraciones, num_parrafos, ${STYLOMETRY_FEATURES.join(", ")}
       from post_stylometry where post_id = $1`,
      [postId]
    ),
    getNorms(),
  ]);
  return {
    literary,
    affect,
    paragraphs,
    themes: themes.map((t) => ({ ...t, nombre: THEMES[t.tema] ?? t.tema })),
    references,
    stylometry,
    norms,
  };
}
