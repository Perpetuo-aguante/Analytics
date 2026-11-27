// Barras horizontales para desgloses categóricos (tipo, sección, país,
// actividad, antigüedad, revenue por plan). A diferencia de LineChart/
// ScatterChart no usa SVG: para etiquetas largas y de longitud variable,
// divs con ancho en porcentaje son más simples y no requieren medir texto.
// La interacción es CSS (ver .bar-row/.bar-fill en globals.css): las barras
// crecen desde el eje al entrar, escalonadas, y la fila bajo el cursor se
// ilumina. Por eso sigue siendo un server component.

export type BarDatum = { label: string; value: number };

export function BarChart({
  data,
  formatValue,
}: {
  data: BarDatum[];
  formatValue?: (value: number) => string;
}) {
  if (data.length === 0) return <p className="text-sm text-ink-muted">Sin datos todavía.</p>;

  const max = Math.max(...data.map((d) => d.value), 1);
  const format = formatValue ?? ((v: number) => v.toLocaleString("es"));

  return (
    <div className="space-y-1">
      {data.map((d, index) => (
        <div key={d.label} className="bar-row flex items-center gap-3 text-sm" title={`${d.label}: ${format(d.value)}`}>
          <span className="w-24 shrink-0 truncate sm:w-36 text-ink-secondary" title={d.label}>
            {d.label}
          </span>
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-surface-sunk">
            <div
              className="bar-fill h-3 rounded-r-[5px] bg-blue"
              style={{
                width: `${Math.max((d.value / max) * 100, d.value > 0 ? 2 : 0)}%`,
                animationDelay: `${Math.min(index, 12) * 40}ms`,
              }}
            />
          </div>
          <span className="tnum w-20 shrink-0 text-right font-medium">{format(d.value)}</span>
        </div>
      ))}
    </div>
  );
}
