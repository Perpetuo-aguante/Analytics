// La guía que lee el agente (Grokbot) antes de analizar los textos: las
// rúbricas del compass (literales del spec), los campos y sus vocabularios
// cerrados, y la forma exacta del JSON. La sirve GET /api/ingest/texts/guia
// para que el agente siempre use la versión vigente.
//
// Está escrita para gastar pocos tokens: el agente la lee UNA vez por
// corrida (no por post) y la respuesta por post es un JSON corto (~600-800
// tokens) con citas breves. El texto del post el agente ya lo tiene leído,
// porque lo acaba de copiar para subirlo.

import { PROMPT_VERSION, THEME_LIST, VOCAB } from "./compass-vocab";

const opts = (values: readonly string[]) => values.map((v) => `"${v}"`).join(" | ");

export const COMPASS_GUIDE = `# Guía de lectura de Perpetuo (versión ${PROMPT_VERSION})

Lee el texto completo y devuelve el objeto \`analisis\` descrito abajo. Describe, no juzgues la calidad.

## Reglas
- Toda \`evidencia\` es una cita LITERAL y contigua del texto, copiada tal cual, de 5 a 15 palabras. Sin "...", sin parafrasear, sin unir fragmentos. Si la cita no existe en el texto, el campo se marca como inválido y se te pedirá de nuevo.
- \`confianza\`: de 0 a 1, qué tan seguro estás de ese campo.
- Los valores con opciones van exactamente como están escritos.
- Lo político es un tema, no un eje.

## Eje X: Referencial (0) ↔ Poético (100)
Pregunta guía: ¿el texto apunta sobre todo al mundo o a su propio lenguaje?
- 0: El lenguaje es transparente: solo vehículo de información y argumento. Cambiar las palabras por sinónimos no pierde nada. Abundan datos, fechas, fuentes. (Análisis de coyuntura, nota explicativa)
- 25: Predomina lo informativo, pero hay voz de autor reconocible: alguna imagen, un giro de estilo, una frase memorable por su forma. (Columna de opinión bien escrita, crónica periodística sobria)
- 50: Forma y contenido pesan igual. El argumento existe, pero la manera de decirlo es parte de lo que se dice. (Ensayo literario, crítica cultural con estilo marcado)
- 75: La forma manda. El texto se sostiene por ritmo, imagen y estructura; parafrasearlo lo destruye. Puede haber referencias al mundo, subordinadas al efecto estético. (Cuento, ensayo lírico, prosa poética)
- 100: El lenguaje es el objeto. Ruptura sintáctica, restricción formal, juego tipográfico o sonoro, fragmento puro. (Poesía experimental, texto oulipiano)

## Eje Y: Impersonal (0) ↔ Subjetivo (100)
Pregunta guía: ¿cuánto del texto está construido desde y sobre la experiencia del yo que enuncia?
- 0: No hay yo. Voz institucional o de tercera persona sin marcas del autor. (Reporte, ficción en tercera persona sin narrador intrusivo)
- 25: El yo aparece como guía del argumento ("sostengo", "me interesa") pero no como materia. (Ensayo académico, reseña)
- 50: El yo es testigo: aporta experiencia propia como evidencia o marco, pero el tema es externo. (Crónica en primera persona, ensayo con anécdota)
- 75: La experiencia propia es el tema principal y el mundo exterior aparece filtrado por ella. (Ensayo personal, memoria)
- 100: Interioridad pura: el texto es la conciencia del yo. (Poesía confesional, diario, autoficción intimista)
Regla para ficción: en ficción con narrador en primera persona, el eje Y mide la interioridad del narrador, no la del autor real.

Usa valores intermedios cuando corresponda. Por eje: \`score\` (entero 0-100), \`confianza\`, \`evidencia\` (2 citas) y \`justificacion\` (una oración).

## Dimensiones
- tesis (retórica; Montaigne; Adorno): \`valor\` ∈ ${opts(VOCAB.tesis)}. En ficción o poesía: "ausente".
- figuracion (Jakobson): \`polo\` ∈ ${opts(VOCAB.polo_dominante)}; \`campos_semanticos\`: 3 a 5 palabras.
- intertextualidad (Genette, Kristeva): \`referencias\`: solo las presentes en el texto (lista vacía si no hay), cada una con \`autor\`, \`obra\` (o null), \`tipo\` ∈ ${opts(VOCAB.tipo_referencia)}, \`tradicion\` ∈ ${opts(VOCAB.tradicion)} y \`evidencia\`.
- lector_implicito (Iser, Eco): \`dificultad\` de 1 a 5; \`competencias\`: lista corta (ej. "historia de México", "canon poético"); \`lector_modelo\`: una oración. Sin evidencia.
- apertura: \`tipo\` ∈ ${opts(VOCAB.tipo_gancho)}; \`fuerza\` de 1 a 5. La evidencia sale del inicio.
- cierre: \`tipo\` ∈ ${opts(VOCAB.cierre)}. La evidencia sale del final.
- temas: de 1 a 5, cada uno con \`peso\` de 0 a 1 (cuánto del texto ocupa). Solo estos slugs:
${THEME_LIST.map((t) => `  ${t.slug} (${t.descripcion})`).join("\n")}

## Forma exacta
{
  "modelo": "<tu modelo>",
  "eje_x": { "score": 62, "confianza": 0.8, "evidencia": ["cita 1", "cita 2"], "justificacion": "…" },
  "eje_y": { "score": 70, "confianza": 0.7, "evidencia": ["cita 1", "cita 2"], "justificacion": "…" },
  "tesis": { "valor": "implícita", "evidencia": "cita", "confianza": 0.7 },
  "figuracion": { "polo": "metafórico", "campos_semanticos": ["casa", "cuerpo", "agua"], "evidencia": "cita", "confianza": 0.7 },
  "intertextualidad": { "referencias": [{ "autor": "Juan Rulfo", "obra": "Pedro Páramo", "tipo": "alusión", "tradicion": "latinoamericana", "evidencia": "cita" }], "confianza": 0.8 },
  "lector_implicito": { "dificultad": 3, "competencias": ["historia de México"], "lector_modelo": "…", "confianza": 0.7 },
  "apertura": { "tipo": "anécdota", "fuerza": 4, "evidencia": "cita", "confianza": 0.8 },
  "cierre": { "tipo": "abierto", "evidencia": "cita", "confianza": 0.7 },
  "temas": [{ "tema": "familia", "peso": 0.7 }, { "tema": "memoria-historia", "peso": 0.3 }]
}

Si la respuesta de la API trae \`reintentar\` (campos con una cita que no está en el texto), vuelve a mandar SOLO esos campos en \`analisis\`, una vez, con citas copiadas tal cual.
`;
