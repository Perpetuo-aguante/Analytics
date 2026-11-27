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
  // Sin hooks (es server component): el id sale de los datos. Dos sparklines
  // idénticas comparten degradado, que es justo lo que se quiere.
  const gradientId = `spark-${(color + values.join("_")).replace(/[^a-zA-Z0-9_-]/g, "")}`.slice(0, 120);

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
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.1} />
          <stop offset="100%" stopColor={color} stopOpacity={0.1} />
        </linearGradient>
      </defs>
      <path d={`${path} L ${width} ${height} L 0 ${height} Z`} fill={`url(#${gradientId})`} stroke="none" />
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={width} cy={1 + inner - ((values[values.length - 1] - min) / range) * inner} r={2} fill={color} />
    </svg>
  );
}
