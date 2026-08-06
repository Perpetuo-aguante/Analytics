export function formatNumber(value: number | null | undefined): string {
  if (value == null) return "—";
  return value.toLocaleString("es");
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

export function formatMoney(value: number | null | undefined): string {
  if (value == null) return "—";
  return `$${value.toLocaleString("es", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Antigüedad en días -> texto legible ("2 años 3 meses", "5 meses", "12 días").
export function formatTenure(days: number | null | undefined): string {
  if (days == null) return "—";
  const years = Math.floor(days / 365);
  const months = Math.floor((days % 365) / 30);
  if (years > 0) {
    return months > 0 ? `${years} a. ${months} m.` : `${years} a.`;
  }
  if (months > 0) return `${months} m.`;
  return `${Math.max(days, 0)} d.`;
}
