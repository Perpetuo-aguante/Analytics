// Detección de posts duplicados por similitud de título/slug.
//
// El motivo de los duplicados: en el export de Substack que usamos, la
// columna real del título a veces se mapea mal (ver columns.ts) y algunas
// cargas terminan guardando el slug "crudo" de Substack como título
// (ej. "las-vende-dulces") en vez del título real ("La vende dulces"). Como
// posts.slug es la clave de upsert (ver subir/actions.ts), dos strings que
// un humano reconoce como "el mismo post" pero no son idénticos byte a byte
// generan dos filas separadas en vez de una sola actualizada. La igualdad
// exacta de slug no alcanza para encontrarlos — por eso comparamos por
// distancia de edición.

export function normalizeForDedupe(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

// Distancia de Levenshtein (sin librerías externas).
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const curr = [i];
    for (let j = 1; j <= n; j++) {
      curr[j] =
        a[i - 1] === b[j - 1]
          ? prev[j - 1]
          : 1 + Math.min(prev[j - 1], prev[j], curr[j - 1]);
    }
    prev = curr;
  }
  return prev[n];
}

// 1 = idénticos (ignorando acentos/mayúsculas/separadores), 0 = sin nada en común.
export function similarity(a: string, b: string): number {
  const na = normalizeForDedupe(a);
  const nb = normalizeForDedupe(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const dist = levenshtein(na, nb);
  return 1 - dist / Math.max(na.length, nb.length);
}
