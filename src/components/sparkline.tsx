// Mini-línea para una celda de tabla: la forma de la serie, sin ejes ni
// números. Siempre acompaña a un valor escrito (el delta de la fila), nunca
// va sola: es contexto de la cifra, no la cifra.

export function Sparkline({
  values,
  color = "var(--blue)",
  width = 96,
  height = 24,
}: {
  values: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);
  // 1px de aire arriba y abajo para que el trazo no se corte contra el borde.
  const inner = height - 2;

  const path = values
    .map((v, i) => `${i === 0 ? "M" : "L"} ${(i * stepX).toFixed(1)} ${(1 + inner - ((v - min) / range) * inner).toFixed(1)}`)
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden className="overflow-visible">
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={width} cy={1 + inner - ((values[values.length - 1] - min) / range) * inner} r={2} fill={color} />
    </svg>
  );
}
