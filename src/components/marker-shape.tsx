import type { MarkerShape } from "@/lib/post-type-style";

// Formas silueteadas para que la identidad de cada tipo de post no dependa
// solo del color (necesario en el scatter: con 7 tipos ningún orden de color
// es distinguible "todos contra todos" bajo daltonismo — ver dataviz skill).
// `size` es el diámetro visual del marcador.
export function MarkerShapeIcon({
  shape,
  cx,
  cy,
  size,
  color,
}: {
  shape: MarkerShape;
  cx: number;
  cy: number;
  size: number;
  color: string;
}) {
  const r = size / 2;
  switch (shape) {
    case "circle":
      return <circle cx={cx} cy={cy} r={r} fill={color} />;
    case "square":
      return <rect x={cx - r} y={cy - r} width={size} height={size} rx={1.5} fill={color} />;
    case "triangle": {
      const points = [[cx, cy - r], [cx + r, cy + r * 0.8], [cx - r, cy + r * 0.8]]
        .map((p) => p.join(","))
        .join(" ");
      return <polygon points={points} fill={color} />;
    }
    case "diamond": {
      const points = [[cx, cy - r], [cx + r, cy], [cx, cy + r], [cx - r, cy]].map((p) => p.join(",")).join(" ");
      return <polygon points={points} fill={color} />;
    }
    case "cross":
      return (
        <g stroke={color} strokeWidth={Math.max(2, size * 0.28)} strokeLinecap="round">
          <line x1={cx - r} y1={cy} x2={cx + r} y2={cy} />
          <line x1={cx} y1={cy - r} x2={cx} y2={cy + r} />
        </g>
      );
    case "star": {
      const spikes = 5;
      const outer = r;
      const inner = r * 0.45;
      const pts: string[] = [];
      for (let i = 0; i < spikes * 2; i++) {
        const radius = i % 2 === 0 ? outer : inner;
        const angle = (Math.PI / spikes) * i - Math.PI / 2;
        pts.push(`${cx + Math.cos(angle) * radius},${cy + Math.sin(angle) * radius}`);
      }
      return <polygon points={pts.join(" ")} fill={color} />;
    }
    case "ring":
      return <circle cx={cx} cy={cy} r={r * 0.7} fill="none" stroke={color} strokeWidth={Math.max(2, size * 0.3)} />;
  }
}
