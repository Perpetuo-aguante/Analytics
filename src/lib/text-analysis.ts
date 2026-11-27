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
// Mapa léxico: PCA de kernel sobre la matriz de similitudes
// ─────────────────────────────────────────────

export type LexicalAxis = {
  // Palabras que tiran hacia cada extremo del eje: es lo que permite
  // leerlo ("de patria/gobierno a madre/casa"), porque el eje en sí no tiene
  // nombre.
  negative: string[];
  positive: string[];
  // Qué parte de la variación entre textos explica este eje (0-1).
  explained: number;
};

export type LexicalMap = {
  ids: string[];
  coords: [number, number][];
  axes: [LexicalAxis, LexicalAxis];
  // Lo necesario para ubicar un texto nuevo en el mismo plano.
  projection: {
    eigenvectors: [number[], number[]];
    eigenvalues: [number, number];
    columnMeans: number[];
    grandMean: number;
  };
};

function dot(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

function normalize(v: number[]): number[] {
  const norm = Math.sqrt(dot(v, v));
  return norm > 0 ? v.map((x) => x / norm) : v;
}

// Autovector dominante de una matriz simétrica por iteración de potencias,
// ortogonal a los que ya se encontraron (deflación).
function powerIteration(matrix: number[][], found: { vector: number[]; value: number }[]): { vector: number[]; value: number } {
  const n = matrix.length;
  // Arranque determinista (no aleatorio) para que el mapa sea el mismo en
  // cada visita mientras no cambien los textos.
  let v = normalize(Array.from({ length: n }, (_, i) => 1 + Math.sin(i + 1) / 2));
  let value = 0;
  for (let iter = 0; iter < 300; iter++) {
    const next = matrix.map((row) => dot(row, v));
    for (const f of found) {
      const proj = f.value * dot(f.vector, v);
      for (let i = 0; i < n; i++) next[i] -= proj * f.vector[i];
    }
    value = dot(v, next);
    const normalized = normalize(next);
    const delta = normalized.reduce((acc, x, i) => acc + Math.abs(x - v[i]), 0);
    v = normalized;
    if (delta < 1e-9) break;
  }
  // El signo de un autovector es arbitrario: se fija para que el elemento de
  // mayor magnitud sea positivo y el mapa no "se dé vuelta" entre visitas.
  let maxIndex = 0;
  for (let i = 1; i < n; i++) if (Math.abs(v[i]) > Math.abs(v[maxIndex])) maxIndex = i;
  if (v[maxIndex] < 0) v = v.map((x) => -x);
  return { vector: v, value: Math.max(value, 0) };
}

export function buildLexicalMap(corpus: Corpus): LexicalMap | null {
  const n = corpus.vectors.length;
  if (n < 3) return null;

  // Matriz de similitudes con un índice invertido (palabra → textos que la
  // usan): solo se multiplican pares que comparten palabras. Comparar cada
  // par de textos palabra por palabra tardaba segundos con unos cientos de
  // textos.
  const postings = new Map<string, { doc: number; weight: number }[]>();
  corpus.vectors.forEach((vector, doc) => {
    for (const [term, weight] of vector) {
      let list = postings.get(term);
      if (!list) postings.set(term, (list = []));
      list.push({ doc, weight });
    }
  });
  const flat = new Float64Array(n * n);
  for (const list of postings.values()) {
    for (let a = 0; a < list.length; a++) {
      const rowOffset = list[a].doc * n;
      const wa = list[a].weight;
      for (let b = 0; b < list.length; b++) flat[rowOffset + list[b].doc] += wa * list[b].weight;
    }
  }
  const kernel: number[][] = Array.from({ length: n }, (_, i) => Array.from(flat.subarray(i * n, (i + 1) * n)));

  // Centrado de la matriz (equivale a centrar los vectores en el origen).
  const columnMeans = kernel.map((row) => row.reduce((a, b) => a + b, 0) / n);
  const grandMean = columnMeans.reduce((a, b) => a + b, 0) / n;
  const centered = kernel.map((row, i) => row.map((value, j) => value - columnMeans[i] - columnMeans[j] + grandMean));
  const trace = centered.reduce((acc, row, i) => acc + row[i], 0);

  const first = powerIteration(centered, []);
  const second = powerIteration(centered, [first]);
  const components = [first, second];

  const coords = corpus.ids.map(
    (_, i) => components.map((c) => c.vector[i] * Math.sqrt(c.value)) as [number, number]
  );

  const axes = components.map((component, axis) => {
    // Carga de cada palabra en el eje: cuánto pesa en los textos de cada
    // extremo. Las más positivas y las más negativas nombran los polos.
    const loading = new Map<string, number>();
    corpus.vectors.forEach((vector, i) => {
      const coord = coords[i][axis];
      for (const [term, weight] of vector) loading.set(term, (loading.get(term) ?? 0) + coord * weight);
    });
    const sorted = [...loading.entries()].sort((a, b) => a[1] - b[1]);
    return {
      negative: sorted.slice(0, 5).filter(([, v]) => v < 0).map(([t]) => t),
      positive: sorted.slice(-5).reverse().filter(([, v]) => v > 0).map(([t]) => t),
      explained: trace > 0 ? component.value / trace : 0,
    };
  }) as [LexicalAxis, LexicalAxis];

  return {
    ids: corpus.ids,
    coords,
    axes,
    projection: {
      eigenvectors: [first.vector, second.vector],
      eigenvalues: [first.value, second.value],
      columnMeans,
      grandMean,
    },
  };
}

// Ubica en el mapa un texto que no estaba en el corpus (un borrador nuevo).
export function projectOntoMap(map: LexicalMap, corpus: Corpus, vector: SparseVector): [number, number] {
  const sims = corpus.vectors.map((other) => cosine(vector, other));
  const n = sims.length;
  const meanSim = sims.reduce((a, b) => a + b, 0) / n;
  const centered = sims.map((s, j) => s - meanSim - map.projection.columnMeans[j] + map.projection.grandMean);
  return map.projection.eigenvectors.map((ev, m) => {
    const value = map.projection.eigenvalues[m];
    return value > 0 ? dot(centered, ev) / Math.sqrt(value) : 0;
  }) as [number, number];
}

// ─────────────────────────────────────────────
// Ejes de estilo y sentimiento
// ─────────────────────────────────────────────

export const STYLE_KEYS = ["ensayistico", "personal", "politico", "intimo"] as const;
export type StyleKey = (typeof STYLE_KEYS)[number];
export type ReadingKey = StyleKey | "sentimiento";
export const READING_KEYS: readonly ReadingKey[] = [...STYLE_KEYS, "sentimiento"];

export const READING_LABELS: Record<ReadingKey, string> = {
  ensayistico: "Ensayístico",
  personal: "Personal",
  politico: "Político",
  intimo: "Íntimo",
  sentimiento: "Sentimiento",
};

export type Reading = Record<ReadingKey, number | null>;

// Lectura estimada de un texto a partir de sus vecinos ya leídos: promedio
// ponderado por similitud al cuadrado (los muy parecidos pesan mucho más que
// los apenas parecidos). Devuelve null en un eje si ningún vecino lo tiene.
export function predictReading(neighbors: { similarity: number; reading: Reading | null }[]): Reading {
  const result = {} as Reading;
  for (const key of READING_KEYS) {
    let weighted = 0;
    let total = 0;
    for (const n of neighbors) {
      const value = n.reading?.[key];
      if (value == null) continue;
      const w = n.similarity * n.similarity;
      weighted += w * value;
      total += w;
    }
    result[key] = total > 0 ? weighted / total : null;
  }
  return result;
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
