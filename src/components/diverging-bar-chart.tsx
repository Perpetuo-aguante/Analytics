// Barras divergentes para un cambio con signo (altas menos bajas por país):
// eje cero al medio, lo que crece va a la derecha en azul y lo que se
// encoge a la izquierda en rojo. El par azul↔rojo es el divergente de la
// marca; el valor va escrito al final de cada barra, así que el signo se lee
// aunque el color no se distinga.
//
// Igual que BarChart, son divs y no SVG: las etiquetas son de largo variable
// y con porcentajes no hay que medir texto.

export type DivergingDatum = { key: string; label: string; value: number };

export function DivergingBarChart({
  data,
  formatValue,
}: {
  data: DivergingDatum[];
  formatValue?: (value: number) => string;
}) {
  if (data.length === 0) return <p className="text-sm text-ink-muted">Sin cambios en este recorte.</p>;

  const max = Math.max(...data.map((d) => Math.abs(d.value)), 1);
  const format =
    formatValue ?? ((v: number) => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v).toLocaleString("es")}`);

  return (
    <div className="space-y-2.5">
      {data.map((d) => {
        const ratio = Math.abs(d.value) / max;
        const positive = d.value >= 0;
        return (
          <div key={d.key} className="flex items-center gap-3 text-sm">
            <span className="w-32 shrink-0 truncate text-ink-muted" title={d.label}>
              {d.label}
            </span>
            <div className="flex flex-1 items-center">
              <div className="flex h-2.5 flex-1 justify-end">
                {!positive && (
                  <div
                    className="h-2.5 rounded-l-[4px] bg-red"
                    style={{ width: `${Math.max(ratio * 100, 2)}%` }}
                  />
                )}
              </div>
              <div className="h-4 w-px shrink-0 bg-line-strong" aria-hidden />
              <div className="flex h-2.5 flex-1">
                {positive && (
                  <div
                    className="h-2.5 rounded-r-[4px] bg-blue"
                    style={{ width: `${Math.max(ratio * 100, d.value > 0 ? 2 : 0)}%` }}
                  />
                )}
              </div>
            </div>
            <span className="tnum w-16 shrink-0 text-right font-medium">{format(d.value)}</span>
          </div>
        );
      })}
    </div>
  );
}
