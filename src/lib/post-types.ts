// Categorías de post para el leaderboard por tipo. El "tipo de post" se
// carga como texto libre desde el Excel/CSV (ver lib/columns.ts), así que
// acá lo emparejamos contra esta lista canónica ignorando mayúsculas,
// acentos y separadores.

import { normalizeHeader } from "./columns";

export const LEADERBOARD_POST_TYPES = [
  "Ensayo",
  "Cuento",
  "Poema",
  "321 Editorial",
  "Anteojos Editorial",
  "Estelar",
  "Foto-Ensayo",
] as const;

export type LeaderboardPostType = (typeof LEADERBOARD_POST_TYPES)[number];

const NORMALIZED_TYPES = new Map(
  LEADERBOARD_POST_TYPES.map((type) => [normalizeHeader(type), type])
);

export function matchPostType(postType: string | null | undefined): LeaderboardPostType | null {
  if (!postType) return null;
  return NORMALIZED_TYPES.get(normalizeHeader(postType)) ?? null;
}
