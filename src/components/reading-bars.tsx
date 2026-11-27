import { READING_LABELS, STYLE_KEYS, type Reading } from "@/lib/text-analysis";

// La lectura de un texto en barras: los cuatro ejes de estilo (0 a 100, una
// sola tinta — es magnitud, no identidad) y el sentimiento como barra
// divergente desde el centro (rojo negativo, azul positivo, centro neutro).
// Cada barra lleva su número escrito: el valor nunca depende del color.
export function ReadingBars({ reading, estimated = false }: { reading: Reading; estimated?: boolean }) {
  const sentiment = reading.sentimiento;
  return (
    <dl className={`space-y-2.5 text-sm ${estimated ? "opacity-90" : ""}`}>
      {STYLE_KEYS.map((key) => {
        const value = reading[key];
        return (
          <div key={key} className="grid grid-cols-[7.5rem_1fr_3rem] items-center gap-3">
            <dt className="text-ink-secondary">{READING_LABELS[key]}</dt>
            <dd className="h-2.5 overflow-hidden rounded-full bg-surface-sunk" aria-hidden>
              {value != null && (
                <div
                  className={`h-full rounded-full ${estimated ? "bg-blue/60" : "bg-blue"}`}
                  style={{ width: `${Math.max(value * 100, 1.5)}%` }}
                />
              )}
            </dd>
            <dd className="tnum text-right font-medium">{value == null ? "—" : Math.round(value * 100)}</dd>
          </div>
        );
      })}
      <div className="grid grid-cols-[7.5rem_1fr_3rem] items-center gap-3">
        <dt className="text-ink-secondary">{READING_LABELS.sentimiento}</dt>
        <dd className="relative h-2.5 rounded-full bg-surface-sunk" aria-hidden>
          <span className="absolute left-1/2 top-[-3px] h-[16px] w-px bg-line-strong" />
          {sentiment != null && (
            <div
              className={`absolute top-0 h-full rounded-full ${sentiment < 0 ? "bg-red" : "bg-blue"} ${estimated ? "opacity-60" : ""}`}
              style={
                sentiment < 0
                  ? { right: "50%", width: `${Math.max(-sentiment * 50, 1)}%` }
                  : { left: "50%", width: `${Math.max(sentiment * 50, 1)}%` }
              }
            />
          )}
        </dd>
        <dd className="tnum text-right font-medium">{sentiment == null ? "—" : formatSentiment(sentiment)}</dd>
      </div>
      <p className="pl-[8.25rem] text-xs text-ink-muted">Estilo de 0 a 100 · sentimiento de −1 (negativo) a +1 (positivo)</p>
    </dl>
  );
}

export function formatSentiment(value: number): string {
  return value > 0 ? `+${value.toFixed(2)}` : value.toFixed(2);
}
