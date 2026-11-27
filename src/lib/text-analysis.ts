// Análisis léxico de los textos completos de los posts (ver post_texts en
// db/schema.sql). Funciones puras, sin dependencias ni APIs de Node: se usan
// en el servidor (ingesta, mapa de textos, parecidos) y se pueden importar
// desde un componente cliente.
//
// La idea: cada texto se reduce a su "huella léxica" — las palabras con
// contenido que usa y cuántas veces (term_counts) — y dos textos se parecen
// en la medida en que comparten palabras poco comunes en el resto del corpus
// (TF-IDF + similitud coseno). Con esas similitudes se arma:
// - la lista de textos más parecidos a uno dado (o a un borrador nuevo);
// - el "mapa léxico": un plano de dos ejes (PCA de kernel sobre la matriz de
//   similitudes) donde los textos que se parecen quedan cerca;
// - la predicción de estilo/sentimiento de un texto nuevo: el promedio de la
//   lectura de sus vecinos más parecidos, ponderado por la similitud.
//
// Es deliberadamente simple (sin embeddings ni llamadas a un modelo): es
// gratis, determinista y explicable — se puede decir qué palabras acercan
// dos textos. La lectura de estilo y sentimiento la hace el agente (un LLM)
// al subir cada texto; esto solo la extiende a los textos que todavía no la
// tienen.

// ─────────────────────────────────────────────
// Normalización y conteo
// ─────────────────────────────────────────────

// Deja el texto en una forma estable antes de guardarlo y de calcular su
// hash: sin BOM, saltos de línea Unix, sin espacios al final de cada línea y
// sin más de una línea en blanco seguida. No toca el contenido.
export function normalizeText(raw: string): string {
  return raw
    .replace(/^﻿/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t ]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const WORD_RE = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;

export function countWords(text: string): number {
  return text.match(WORD_RE)?.length ?? 0;
}

// Minutos de lectura a ~230 palabras por minuto (lectura en pantalla en
// español), redondeado hacia arriba y con un mínimo de 1.
export function readingMinutes(wordCount: number): number {
  return Math.max(1, Math.ceil(wordCount / 230));
}

// Palabras vacías del español (artículos, preposiciones, pronombres, verbos
// auxiliares y muletillas), ya sin tildes porque se comparan después de
// quitarlas. No aportan nada a "de qué habla" un texto y dominarían el conteo.
const STOPWORDS = new Set(
  `a acá aca ahi ahí al algo algun alguna algunas alguno algunos alla alli allí ambos ante antes aquel aquella
  aquellas aquello aquellos aqui asi aun aunque bajo bien cada casi como con contra cual cuales cualquier cuando
  cuanto cuya cuyo de del desde donde dos durante el ella ellas ello ellos en entonces entre era eran eres es esa
  esas ese eso esos esta estaba estaban estado estamos estan estar estas este esto estos estoy fue fueron fui ha
  habia habian haber habra hace hacen hacer hacia han hasta hay he hemos la las le les lo los mas me mi mia mias
  mientras mio mios mis mucho muchos muy nada ni no nos nosotras nosotros nuestra nuestras nuestro nuestros nunca
  o os otra otras otro otros para pero poco por porque pues que quien quienes se sea sean segun ser si sido siempre
  sin sino sobre sois solo somos son soy su sus suya suyas suyo suyos tal tambien tampoco tan tanto te tenemos
  tener tengo ti tiene tienen toda todas todo todos tras tu tus tuya tuyo un una unas uno unos usted ustedes va
  vamos van vaya vez vos vosotros y ya yo cosa cosas puede pueden podia poder decir dice dijo dicen hecho hizo
  haya hubiera fuera sera seria serian tuvo tenia tenian estaba estuvo cierto cierta mismo misma mismos mismas
  otra luego ademas despues ahora asi aqui alla eso esto cual algo nadie alguien cada todo toda mientras donde
  menos ninguna ninguno nos les sus ser sino tras via etc pues esa ese igual tipo parte forma manera veces dia
  dias año años ano anos vez cosa`.split(/\s+/)
);

function stripAccents(word: string): string {
  return word.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Las palabras con contenido de un texto, normalizadas (minúsculas, sin
// tildes): fuera números, palabras de menos de 3 letras y palabras vacías.
export function contentTerms(text: string): string[] {
  const terms: string[] = [];
  for (const match of text.matchAll(/\p{L}+/gu)) {
    const word = stripAccents(match[0].toLowerCase());
    if (word.length < 3 || STOPWORDS.has(word)) continue;
    terms.push(word);
  }
  return terms;
}

// Cuántas palabras distintas se guardan por texto. Con 400 entran todas las
// que se repiten en un texto normal; las que aparecen una sola vez en un texto
// muy largo quedan fuera, y son justo las que menos dicen de él.
export const MAX_TERMS_PER_TEXT = 400;

export type TermCounts = Record<string, number>;

export function termCounts(text: string, limit = MAX_TERMS_PER_TEXT): TermCounts {
  const counts = new Map<string, number>();
  for (const term of contentTerms(text)) counts.set(term, (counts.get(term) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit);
  return Object.fromEntries(top);
}

// ─────────────────────────────────────────────
// Corpus: TF-IDF y similitud coseno
// ─────────────────────────────────────────────

type SparseVector = Map<string, number>;

export type CorpusDoc = { id: string; terms: TermCounts };

export type Corpus = {
  ids: string[];
  vectors: SparseVector[];
  idf: Map<string, number>;
  // idf de una palabra que no aparece en ningún texto del corpus.
  unseenIdf: number;
};

export function buildCorpus(docs: CorpusDoc[]): Corpus {
  const df = new Map<string, number>();
  for (const doc of docs) {
    for (const term of Object.keys(doc.terms)) df.set(term, (df.get(term) ?? 0) + 1);
  }
  const n = docs.length;
  const idf = new Map<string, number>();
  for (const [term, count] of df) idf.set(term, Math.log((n + 1) / (count + 1)) + 1);
  const corpus: Corpus = { ids: docs.map((d) => d.id), vectors: [], idf, unseenIdf: Math.log(n + 1) + 1 };
  corpus.vectors = docs.map((d) => vectorize(corpus, d.terms));
  return corpus;
}

// TF sublineal (1 + log tf) por IDF, normalizado a largo 1: así un texto
// largo no "se parece" más a todo solo por tener más palabras.
export function vectorize(corpus: Pick<Corpus, "idf" | "unseenIdf">, terms: TermCounts): SparseVector {
  const vector: SparseVector = new Map();
  let norm = 0;
  for (const [term, tf] of Object.entries(terms)) {
    if (tf <= 0) continue;
    const weight = (1 + Math.log(tf)) * (corpus.idf.get(term) ?? corpus.unseenIdf);
    vector.set(term, weight);
    norm += weight * weight;
  }
  norm = Math.sqrt(norm);
  if (norm > 0) for (const [term, weight] of vector) vector.set(term, weight / norm);
  return vector;
}

export function cosine(a: SparseVector, b: SparseVector): number {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [term, weight] of small) {
    const other = large.get(term);
    if (other !== undefined) dot += weight * other;
  }
  return dot;
}

// Las palabras que más pesan en la similitud entre dos textos: lo que
// explica por qué se parecen.
export function sharedTerms(a: SparseVector, b: SparseVector, limit = 6): string[] {
  const shared: [string, number][] = [];
  for (const [term, weight] of a) {
    const other = b.get(term);
    if (other !== undefined) shared.push([term, weight * other]);
  }
  return shared
    .sort((x, y) => y[1] - x[1])
    .slice(0, limit)
    .map(([term]) => term);
}

export type Neighbor = { id: string; similarity: number; sharedTerms: string[] };

export function nearestNeighbors(corpus: Corpus, vector: SparseVector, k: number, excludeId?: string): Neighbor[] {
  const scored: { index: number; similarity: number }[] = [];
  corpus.vectors.forEach((other, index) => {
    if (corpus.ids[index] === excludeId) return;
    scored.push({ index, similarity: cosine(vector, other) });
  });
  return scored
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, k)
    .filter((s) => s.similarity > 0)
    .map((s) => ({
      id: corpus.ids[s.index],
      similarity: s.similarity,
      sharedTerms: sharedTerms(vector, corpus.vectors[s.index]),
    }));
}

// ─────────────────────────────────────────────
// Estimaciones a partir de los vecinos
// ─────────────────────────────────────────────

// Promedio ponderado por similitud al cuadrado (los muy parecidos pesan
// mucho más que los apenas parecidos). null si ningún vecino tiene el valor.
export function weightedEstimate(neighbors: { similarity: number; value: number | null }[]): number | null {
  let weighted = 0;
  let total = 0;
  for (const n of neighbors) {
    if (n.value == null) continue;
    const w = n.similarity * n.similarity;
    weighted += w * n.value;
    total += w;
  }
  return total > 0 ? weighted / total : null;
}

// Sección más probable de un texto: voto de sus vecinos ponderado por
// similitud. Devuelve cada sección con su peso relativo (0-1), de mayor a
// menor.
export function predictCategory(neighbors: { similarity: number; category: string | null }[]): { category: string; share: number }[] {
  const votes = new Map<string, number>();
  let total = 0;
  for (const n of neighbors) {
    if (!n.category) continue;
    const w = n.similarity * n.similarity;
    votes.set(n.category, (votes.get(n.category) ?? 0) + w);
    total += w;
  }
  if (total === 0) return [];
  return [...votes.entries()]
    .map(([category, weight]) => ({ category, share: weight / total }))
    .sort((a, b) => b.share - a.share);
}
