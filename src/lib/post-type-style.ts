// Identidad visual fija por tipo de post: un color Y una forma, siempre la
// misma en todos los charts. Nunca reasignar estos valores al filtrar: la
// identidad de cada tipo debe mantenerse estable aunque cambie cuántos tipos
// hay en pantalla.
//
// La paleta está validada (scripts/validate_palette.js de la skill dataviz)
// contra la superficie de la app (#f9f6f1) en la lista de pares *adyacentes*
// — la que aplica a barras, líneas y series temporales:
//
//   Banda de luminosidad  PASS (los 7 dentro de L 0.43–0.77)
//   Piso de croma         PASS
//   Separación CVD        PASS (peor par #eda100↔#1baf7a ΔE 9.1, objetivo ≥8)
//   Piso visión normal    PASS (peor par ΔE 22.9, piso ≥15)
//   Contraste vs fondo    WARN — aqua, amarillo y magenta quedan bajo 3:1
//
// Ese WARN obliga a un canal de alivio, no es descartable: todos los charts
// que usan estos colores llevan etiquetas directas y un "Ver como tabla".
//
// En scatter (donde cualquier par de puntos puede quedar lado a lado, o sea
// la lista de *todos* los pares) 7 series no pasan el piso CVD — ninguna
// ordenación de 7 colores lo hace. Por eso el scatter lleva además una forma
// distinta por tipo, y por eso los chips de tipo son la vía principal para
// reducir la cantidad de series en pantalla: con ≤3 tipos visibles la paleta
// pasa la lista completa de pares.
//
// Los dos colores de marca de Perpetuo (azul #0f52a0, rojo #d0301f) están
// asignados a las dos secciones que más se miran: Estelar y Anteojos.

import type { LeaderboardPostType } from "./post-types";

export type MarkerShape = "circle" | "square" | "triangle" | "diamond" | "cross" | "star" | "ring";

export const POST_TYPE_STYLE: Record<LeaderboardPostType, { color: string; shape: MarkerShape }> = {
  Estelar: { color: "#0f52a0", shape: "circle" },
  "Anteojos Editorial": { color: "#d0301f", shape: "star" },
  "El Creativo": { color: "#1baf7a", shape: "cross" },
  Ensayo: { color: "#eda100", shape: "square" },
  Cuento: { color: "#8a4fd0", shape: "triangle" },
  Poema: { color: "#008300", shape: "diamond" },
  "Foto-Ensayo": { color: "#e87ba4", shape: "ring" },
};

export function postTypeStyle(type: LeaderboardPostType) {
  return POST_TYPE_STYLE[type];
}
