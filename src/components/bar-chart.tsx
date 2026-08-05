// Barras horizontales para desgloses categóricos (tipo, sección, país,
// actividad, antigüedad, revenue por plan). A diferencia de LineChart/
// ScatterChart no usa SVG: para etiquetas largas y de longitud variable,
// divs con ancho en porcentaje son más simples y no requieren medir texto.
// No tiene interacción, así que no necesita ser un client component.

export type BarDatum = { label: string; value: number };

export function BarChart({
  data,
  formatValue,
}: {
  data: BarDatum[];
  formatValue?: (value: number) => string;
}) {
  if (data.length === 0) return <p className="text-sm text-muted">Sin datos todavía.</p>;

  const max = Math.max(...data.map((d) => d.value), 1);
  const format = formatValue ?? ((v: number) => v.toLocaleString("es"));

  return (
    <div className="space-y-2.5">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-3 text-sm">
          <span className="w-36 shrink-0 truncate text-muted" title={d.label}>
            {d.label}
          </span>
          <div className="h-2 flex-1 rounded-full bg-border">
            <div
              className="h-2 rounded-full bg-accent"
              style={{ width: `${Math.max((d.value / max) * 100, d.value > 0 ? 2 : 0)}%` }}
            />
          </div>
          <span className="w-20 shrink-0 text-right font-medium">{format(d.value)}</span>
        </div>
      ))}
    </div>
  );
}
