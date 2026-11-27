// Lectura del compass editorial (versión lean): la lectura que mandó el
// agente (post_compass, post_themes, post_references) y la estilometría
// mínima de cada texto (post_texts.features). Solo servidor.

import { query, queryOne } from "./db";
import { PROMPT_VERSION, THEMES } from "./compass-vocab";
import { FEATURE_KEYS, type FeatureKey, type TextFeatures } from "./text-features";

// Por debajo de esta confianza en un eje, el punto se dibuja atenuado.
export const CONFIDENCE_FLOOR = 0.5;

// Media y desviación de cada rasgo sobre todos los textos cargados. Se
// calcula al vuelo (son cientos de filas): siempre está al día y no hace
// falta una tabla de normas que recalcular.
export type Norms = Partial<Record<FeatureKey, { media: number; desviacion: number }>>;

export async function getNorms(): Promise<Norms> {
  const cols = FEATURE_KEYS.map(
    (f) => `avg((features->>'${f}')::float) as "${f}_m", stddev_pop((features->>'${f}')::float) as "${f}_d"`
  ).join(", ");
  const row = await queryOne<Record<string, number | null>>(`select ${cols} from post_texts`);
  const norms: Norms = {};
  for (const f of FEATURE_KEYS) {
    const media = row?.[`${f}_m`];
    const desviacion = row?.[`${f}_d`];
    if (media != null && desviacion != null) norms[f] = { media: Number(media), desviacion: Number(desviacion) };
  }
  return norms;
}

export function zScore(norms: Norms, feature: FeatureKey, value: number | null | undefined): number | null {
  const n = norms[feature];
  if (value == null || !n || !n.desviacion) return null;
  return (value - n.media) / n.desviacion;
}

// Anclaje: si lo que puntuó el LLM en un eje contradice de frente lo que
// miden los números, se avisa. Son alertas, no correcciones: un cuento en
// tercera persona con focalización interna, por ejemplo, puede ser muy
// subjetivo con poca primera persona.
export function anchorAlerts(
  row: { compass_x: number | null; compass_y: number | null; features: Partial<TextFeatures> | null },
  norms: Norms
): string[] {
  const alerts: string[] = [];
  const ref = zScore(norms, "densidad_referencial", row.features?.densidad_referencial);
  const yo = zScore(norms, "primera_persona", row.features?.primera_persona);
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
// Corpus: un registro por post con lectura
// ─────────────────────────────────────────────

export type CompassRow = {
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
  tesis: string | null;
  polo_dominante: string | null;
  dificultad: number | null;
  tipo_gancho: string | null;
  fuerza_gancho: number | null;
  cierre: string | null;
  campos_evidencia_invalida: string[];
  // La lectura es de una versión anterior del texto o de la guía.
  desactualizada: boolean;
  features: Partial<TextFeatures> | null;
  temas: { tema: string; peso: number }[];
  tradiciones: string[];
  views: number | null;
  open_rate: number | null;
  new_subscribers: number | null;
  engagement: number | null;
};

export function getCompassCorpus(): Promise<CompassRow[]> {
  return query<CompassRow>(
    `select p.id as post_id, p.slug, p.title, p.published_at, p.post_type, p.extra_post_types,
            c.compass_x, c.compass_y, c.compass_x_confianza, c.compass_y_confianza,
            c.tesis, c.polo_dominante, c.dificultad, c.tipo_gancho, c.fuerza_gancho, c.cierre,
            c.campos_evidencia_invalida,
            (c.content_hash <> t.content_hash or c.prompt_version <> $1) as desactualizada,
            t.features,
            coalesce((select json_agg(json_build_object('tema', th.tema, 'peso', th.peso) order by th.peso desc)
              from post_themes th where th.post_id = p.id), '[]'::json) as temas,
            coalesce((select array_agg(r.tradicion) from post_references r where r.post_id = p.id), '{}') as tradiciones,
            m.views, m.open_rate, m.new_subscribers, m.engagement
     from post_compass c
     join posts p on p.id = c.post_id
     join post_texts t on t.post_id = c.post_id
     left join current_metrics m on m.post_id = c.post_id
     order by p.published_at desc nulls last`,
    [PROMPT_VERSION]
  );
}

export async function countPending(): Promise<{ texts: number; pending: number }> {
  const row = await queryOne<{ texts: number; pending: number }>(
    `select count(*) as texts,
            count(*) filter (where c.post_id is null or c.content_hash <> t.content_hash or c.prompt_version <> $1) as pending
     from post_texts t left join post_compass c on c.post_id = t.post_id`,
    [PROMPT_VERSION]
  );
  return row ?? { texts: 0, pending: 0 };
}

// ─────────────────────────────────────────────
// Un post
// ─────────────────────────────────────────────

export type Dimension = Record<string, unknown> & { evidencia?: unknown; confianza?: number; evidencia_invalida?: boolean };

export type CompassDetail = {
  content_hash: string;
  prompt_version: string;
  modelo: string | null;
  compass_x: number;
  compass_y: number;
  dimensiones: Record<string, Dimension>;
  campos_evidencia_invalida: string[];
  analyzed_at: string;
};

export type PostCompass = {
  compass: CompassDetail | null;
  themes: { tema: string; nombre: string; peso: number }[];
  references: { autor: string; obra: string | null; tipo: string; tradicion: string; evidencia: string | null; evidencia_invalida: boolean }[];
  norms: Norms;
};

export async function getPostCompass(postId: string): Promise<PostCompass> {
  const [compass, themes, references, norms] = await Promise.all([
    queryOne<CompassDetail>(
      `select content_hash, prompt_version, modelo, compass_x, compass_y, dimensiones, campos_evidencia_invalida, analyzed_at
       from post_compass where post_id = $1`,
      [postId]
    ),
    query<{ tema: string; peso: number }>("select tema, peso from post_themes where post_id = $1 order by peso desc", [postId]),
    query<PostCompass["references"][number]>(
      "select autor, obra, tipo, tradicion, evidencia, evidencia_invalida from post_references where post_id = $1 order by autor",
      [postId]
    ),
    getNorms(),
  ]);
  return { compass, themes: themes.map((t) => ({ ...t, nombre: THEMES[t.tema] ?? t.tema })), references, norms };
}
