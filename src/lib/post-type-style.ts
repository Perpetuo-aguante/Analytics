// Identidad visual fija por tipo de post: un color Y una forma, siempre la
// misma en todos los charts. Con 7 tipos, ningún orden de color pasa la
// validación de contraste "todos contra todos" que exige un scatter (ver
// dataviz skill) — por eso la forma es la señal principal y el color es
// refuerzo, nunca al revés. Nunca reasignar estos valores al filtrar: la
// identidad de cada tipo debe mantenerse estable.

import type { LeaderboardPostType } from "./post-types";

export type MarkerShape = "circle" | "square" | "triangle" | "diamond" | "cross" | "star" | "ring";

export const POST_TYPE_STYLE: Record<LeaderboardPostType, { color: string; shape: MarkerShape }> = {
  Ensayo: { color: "#e87ba4", shape: "square" },
  Cuento: { color: "#eda100", shape: "triangle" },
  Poema: { color: "#1baf7a", shape: "diamond" },
  "321 Editorial": { color: "#008300", shape: "cross" },
  "Anteojos Editorial": { color: "#4a3aa7", shape: "star" },
  Estelar: { color: "#2a78d6", shape: "circle" },
  "Foto-Ensayo": { color: "#e34948", shape: "ring" },
};

export function postTypeStyle(type: LeaderboardPostType) {
  return POST_TYPE_STYLE[type];
}
