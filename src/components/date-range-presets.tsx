"use client";

// Botones de acceso rápido para rangos de fecha relativos (últimos N días).
// Se usa tanto en el filtro de posts (/) como en la sección de promedios
// (/promedios) — reemplaza los inputs type="date" cuando el usuario solo
// quiere "última semana", "últimos 30 días", etc. sin tener que calcular
// fechas exactas a mano.

import { usePathname, useRouter } from "next/navigation";

const PRESETS = [
  { label: "Última semana", days: 7 },
  { label: "Últimos 14 días", days: 14 },
  { label: "Últimos 30 días", days: 30 },
  { label: "Últimos 90 días", days: 90 },
  { label: "Últimos 180 días", days: 180 },
] as const;

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function presetRange(days: number): { desde: string; hasta: string } {
  const hasta = new Date();
  const desde = new Date();
  desde.setDate(desde.getDate() - days);
  return { desde: toIsoDate(desde), hasta: toIsoDate(hasta) };
}

export function DateRangePresets({
  currentParams,
}: {
  currentParams: Record<string, string | undefined>;
}) {
  const router = useRouter();
  const pathname = usePathname();

  function apply(days: number) {
    const { desde, hasta } = presetRange(days);
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(currentParams)) {
      if (value && key !== "desde" && key !== "hasta") params.set(key, value);
    }
    params.set("desde", desde);
    params.set("hasta", hasta);
    router.push(`${pathname}?${params.toString()}`);
  }

  function isActive(days: number): boolean {
    if (!currentParams.desde || !currentParams.hasta) return false;
    const { desde, hasta } = presetRange(days);
    return currentParams.desde === desde && currentParams.hasta === hasta;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {PRESETS.map((p) => (
        <button
          key={p.days}
          type="button"
          onClick={() => apply(p.days)}
          aria-pressed={isActive(p.days)}
          className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
            isActive(p.days)
              ? "border-accent bg-accent/10 text-foreground"
              : "border-border text-muted hover:border-accent hover:text-foreground"
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
