// El indicador de tendencia de una fila: "▲ +124 · +18%".
//
// Azul para lo que sube, rojo para lo que baja — el par divergente de la
// marca, con el gris reservado para "sin cambio relevante". El color nunca
// es el único canal: el signo del número y la flecha dicen lo mismo, y el
// aria-label lo escribe en palabras.

import { formatPercent } from "@/lib/display";

export type TrendDirection = "alza" | "baja" | "estable";

const GLYPH: Record<TrendDirection, string> = { alza: "▲", baja: "▼", estable: "→" };
const COLOR: Record<TrendDirection, string> = {
  alza: "var(--blue)",
  baja: "var(--red)",
  estable: "var(--ink-muted)",
};
const WORD: Record<TrendDirection, string> = { alza: "al alza", baja: "a la baja", estable: "estable" };

export function TrendBadge({
  trend,
  delta,
  growth,
}: {
  trend: TrendDirection;
  delta: number;
  growth?: number | null;
}) {
  const signed = `${delta > 0 ? "+" : delta < 0 ? "−" : "±"}${Math.abs(delta).toLocaleString("es")}`;
  const relative = growth != null ? `${growth > 0 ? "+" : growth < 0 ? "−" : ""}${formatPercent(Math.abs(growth))}` : null;

  return (
    <span
      className="tnum inline-flex items-baseline gap-1.5 text-sm font-medium"
      style={{ color: COLOR[trend] }}
      aria-label={`${WORD[trend]}: ${signed} suscriptores${relative ? `, ${relative}` : ""}`}
    >
      <span aria-hidden>{GLYPH[trend]}</span>
      <span>{signed}</span>
      {relative && (
        <span aria-hidden className="text-xs text-ink-muted">
          {relative}
        </span>
      )}
    </span>
  );
}
