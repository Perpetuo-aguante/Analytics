// Vocabularios cerrados del compass editorial, para mostrar y agrupar en la
// app. La fuente de verdad es analysis/perpetuo_analysis/vocab.py;
// analysis/tests/test_vocab.py falla si esta copia se desincroniza.

export const VOCAB = {
  emocion_dominante: ["alegría", "tristeza", "ira", "miedo", "sorpresa", "asco", "nostalgia", "asombro", "ternura", "neutra"],
  arco: ["ascenso", "caída", "caída-ascenso", "ascenso-caída", "ascenso-caída-ascenso", "caída-ascenso-caída"],
  distancia_afectiva: ["contenida", "moderada", "efusiva"],
  narrador: ["homodiegético", "autodiegético", "heterodiegético", "ensayístico", "impersonal"],
  focalizacion: ["cero", "interna", "externa", "variable"],
  distancia_narrativa: ["mimética", "diegética", "mixta"],
  contraparte: ["ausente", "hombre de paja", "representada con justicia"],
  orden_temporal: ["lineal", "analepsis", "prolepsis", "fragmentario"],
  ritmo_dominante: ["escena", "sumario", "pausa descriptiva", "elipsis"],
  tesis: ["explícita al inicio", "explícita al final", "implícita", "ausente"],
  estructura: ["deductiva", "inductiva", "dialéctica", "ensayo-paseo", "acumulativa"],
  autoridad: ["ninguna", "citas de apoyo", "citas en diálogo crítico"],
  polo_dominante: ["metafórico", "metonímico", "equilibrado"],
  tipo: ["cita", "alusión", "parodia", "epígrafe"],
  tradicion: ["latinoamericana", "española", "europea", "anglo", "clásica", "otra"],
  tipo_gancho: ["escena in medias res", "pregunta", "tesis provocadora", "anécdota", "dato", "cita", "imagen", "contexto expositivo"],
  cierre: ["abierto", "cerrado", "epifánico", "remate irónico", "circular", "llamado a la acción"],
} as const;

export type VocabKey = keyof typeof VOCAB;

// Taxonomía de temas (PROVISIONAL, ver vocab.py): slug → nombre.
export const THEMES: Record<string, string> = {
  "politica-poder": "Política y poder",
  "violencia": "Violencia",
  "justicia-derechos": "Justicia y derechos",
  "migracion-frontera": "Migración y frontera",
  "ciudad-territorio": "Ciudad y territorio",
  "memoria-historia": "Memoria e historia",
  "familia": "Familia",
  "amor-deseo": "Amor y deseo",
  "duelo-muerte": "Duelo y muerte",
  "cuerpo-salud": "Cuerpo y salud",
  "identidad-genero": "Identidad y género",
  "infancia": "Infancia",
  "trabajo-economia": "Trabajo y economía",
  "tecnologia": "Tecnología",
  "naturaleza-ambiente": "Naturaleza y ambiente",
  "fe-espiritualidad": "Fe y espiritualidad",
  "literatura-escritura": "Literatura y escritura",
  "arte-cultura": "Arte y cultura",
  "filosofia-ideas": "Filosofía e ideas",
  "viaje": "Viaje",
  "comida": "Comida",
  "deporte-juego": "Deporte y juego",
};
