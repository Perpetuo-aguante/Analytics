export function formatNumber(value: number | null | undefined): string {
  if (value == null) return "—";
  return value.toLocaleString("es");
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${(value * 100).toFixed(1)}%`;
}
