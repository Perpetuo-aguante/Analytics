// Categorías de post: viven en la tabla post_categories (ver
// db/schema.sql) en vez de una lista fija en
// código, para que se puedan crear y borrar desde /subir sin redeployar.

import { query } from "./db";
import type { PostCategory } from "./db-types";

export type MarkerShape = "circle" | "square" | "triangle" | "diamond" | "cross" | "star" | "ring";

export type Category = Omit<PostCategory, "shape"> & { shape: MarkerShape };

// Paleta categórica validada (scripts/validate_palette.js de la skill
// dataviz) contra el crema de Perpetuo. Los dos primeros lugares son el
// azul (paso de datos) y el rojo del sistema de diseño de Perpetuo en la lista de pares *adyacentes*:
// separación CVD y contraste normal pasan para los 7; el contraste vs. fondo
// de aqua/amarillo/rosa queda bajo 3:1 (por eso esos charts llevan etiqueta
// directa y "Ver como tabla" — nunca dependen solo del color). Una categoría
// nueva no elige color/forma a mano: se le asigna el siguiente lugar de esta
// paleta (ver autoStyleForIndex) para no romper esa validación con un hex
// cualquiera. Pasado el séptimo lugar, la paleta se recicla.
const AUTO_PALETTE: { color: string; shape: MarkerShape }[] = [
  { color: "#0a4f9c", shape: "circle" },
  { color: "#e2543b", shape: "star" },
  { color: "#1baf7a", shape: "cross" },
  { color: "#eda100", shape: "square" },
  { color: "#8a4fd0", shape: "triangle" },
  { color: "#008300", shape: "diamond" },
  { color: "#e87ba4", shape: "ring" },
];

export function autoStyleForIndex(index: number): { color: string; shape: MarkerShape } {
  return AUTO_PALETTE[index % AUTO_PALETTE.length];
}

// Las categorías creadas antes de adoptar la paleta del sistema de Perpetuo
// guardaron el azul y el rojo viejos. Se traducen al leer para que todos los
// charts hablen con la paleta nueva sin migrar la base; si alguien edita la
// categoría desde /subir, se guarda ya con el color nuevo.
const LEGACY_COLORS: Record<string, string> = {
  "#0f52a0": "#0a4f9c",
  "#d0301f": "#e2543b",
};

export async function getCategories(): Promise<Category[]> {
  const rows = await query<Category>("select * from post_categories order by sort_order asc");
  return rows.map((c) => ({ ...c, color: LEGACY_COLORS[c.color?.toLowerCase()] ?? c.color }));
}
