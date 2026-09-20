// Categorías de post: viven en la tabla post_categories (ver
// supabase/migrations/0005_post_categories.sql) en vez de una lista fija en
// código, para que se puedan crear y borrar desde /subir sin redeployar.

import { createAnonClient } from "./supabase/server";
import type { PostCategory } from "./supabase/types";

export type MarkerShape = "circle" | "square" | "triangle" | "diamond" | "cross" | "star" | "ring";

export type Category = Omit<PostCategory, "shape"> & { shape: MarkerShape };

// Paleta categórica validada (scripts/validate_palette.js de la skill
// dataviz) contra la superficie de la app en la lista de pares *adyacentes*:
// separación CVD y contraste normal pasan para los 7; el contraste vs. fondo
// de aqua/amarillo/rosa queda bajo 3:1 (por eso esos charts llevan etiqueta
// directa y "Ver como tabla" — nunca dependen solo del color). Una categoría
// nueva no elige color/forma a mano: se le asigna el siguiente lugar de esta
// paleta (ver autoStyleForIndex) para no romper esa validación con un hex
// cualquiera. Pasado el séptimo lugar, la paleta se recicla.
const AUTO_PALETTE: { color: string; shape: MarkerShape }[] = [
  { color: "#0f52a0", shape: "circle" },
  { color: "#d0301f", shape: "star" },
  { color: "#1baf7a", shape: "cross" },
  { color: "#eda100", shape: "square" },
  { color: "#8a4fd0", shape: "triangle" },
  { color: "#008300", shape: "diamond" },
  { color: "#e87ba4", shape: "ring" },
];

export function autoStyleForIndex(index: number): { color: string; shape: MarkerShape } {
  return AUTO_PALETTE[index % AUTO_PALETTE.length];
}

export async function getCategories(): Promise<Category[]> {
  const supabase = createAnonClient();
  const { data, error } = await supabase
    .from("post_categories")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Category[];
}
