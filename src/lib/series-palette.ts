// Paleta categórica para series que NO son tipos de post (países, regiones).
//
// Son exactamente los mismos siete hexes de `post-type-style.ts`, en el mismo
// orden: esa secuencia ya está validada contra la superficie de la app
// (scripts/validate_palette.js de la skill dataviz) en la lista de pares
// adyacentes, que es la que aplica a líneas y barras —
//
//   Banda de luminosidad  PASS · Piso de croma        PASS
//   Separación CVD        PASS (peor par ΔE 9.1)
//   Piso visión normal    PASS (peor par ΔE 22.9)
//   Contraste vs fondo    WARN (aqua, amarillo y rosa bajo 3:1)
//
// — y ese WARN obliga al mismo alivio que en los charts de posts: etiqueta
// directa al final de cada línea y "Ver como tabla". Nunca se generan colores
// nuevos: pasado el séptimo, las series se pliegan en "Otros".
//
// No se importa POST_TYPE_STYLE a propósito: aquel mapa es la identidad fija
// de los siete tipos de post y no debe leerse como "el color de Argentina es
// el de Estelar". Acá el color identifica a una serie dentro de un chart, y
// el orden se lo fija quien llama.

export const SERIES_PALETTE = [
  "#0f52a0", // azul de marca
  "#d0301f", // rojo de marca
  "#1baf7a",
  "#eda100",
  "#8a4fd0",
  "#008300",
  "#e87ba4",
] as const;

// "Otros" no es una identidad, es el resto: va en gris para que no compita
// con los países que sí tienen nombre propio en el chart.
export const RESIDUAL_COLOR = "#8a8279";

/**
 * Asigna un color a cada clave, en el orden recibido. El color sigue a la
 * entidad, no a su posición en pantalla: quien llama pasa siempre el mismo
 * orden (el ranking sobre la base completa), así que ocultar una serie desde
 * la leyenda o cambiar la ventana de tiempo no repinta a las demás.
 */
export function assignSeriesColors(keys: readonly string[], residualKeys: readonly string[] = []): Map<string, string> {
  const residual = new Set(residualKeys);
  const colors = new Map<string, string>();
  let slot = 0;
  for (const key of keys) {
    if (residual.has(key)) {
      colors.set(key, RESIDUAL_COLOR);
      continue;
    }
    colors.set(key, SERIES_PALETTE[slot % SERIES_PALETTE.length]);
    slot += 1;
  }
  return colors;
}
