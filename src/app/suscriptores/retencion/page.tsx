import { MultiLineChart, type LineSeries } from "@/components/multi-line-chart";
import { PageHeader } from "@/components/page-header";
import { StatTiles } from "@/components/stat-tiles";
import { formatNumber, formatPercent } from "@/lib/display";
import { getRetentionData, rate, type CohortRow, type EarlyEngagementRow } from "@/lib/retention-queries";
import { SubscriberTabs } from "../subscriber-tabs";

export const dynamic = "force-dynamic";

// Por debajo de este tamaño, un promedio o un porcentaje se mueve demasiado
// con una sola persona: se muestra el número pero marcado como tentativo.
const MIN_SAMPLE = 20;

export default async function RetencionPage() {
  const d = await getRetentionData();
  const t = d.totals;

  const tiles = [
    {
      label: "Siguen al mes",
      value: formatPercent(rate(t.retained30, t.eligible30)),
      hint: `de ${formatNumber(t.eligible30)} altas del último año`,
    },
    {
      label: "Siguen a los 3 meses",
      value: formatPercent(rate(t.retained90, t.eligible90)),
      hint: `de ${formatNumber(t.eligible90)} altas del último año`,
    },
    {
      label: "Pagan dentro del 1.er mes",
      value: formatPercent(rate(t.paid30, t.eligible30)),
      hint: "pago desde el alta o upgrade en 30 días",
    },
    {
      label: "Pagan dentro de 3 meses",
      value: formatPercent(rate(t.paid90, t.eligible90)),
      hint: "pago desde el alta o upgrade en 90 días",
    },
  ];

  // Una cohorte entra al chart solo cuando todas sus altas ya cumplieron el
  // plazo: una cohorte a medio madurar mostraría una retención inflada (los
  // que todavía no tuvieron tiempo de irse cuentan como "siguen").
  const mature = (row: CohortRow, days: 30 | 90) =>
    days === 30 ? row.eligible30 === row.signups : row.eligible90 === row.signups;
  // Todos los meses entre la primera y la última alta, también los que no
  // tuvieron altas (quedan como hueco): sin eso el eje junta meses lejanos
  // como si fueran vecinos.
  const byMonth = new Map(d.cohorts.map((c) => [c.month, c]));
  const months = monthRange(d.cohorts[0]?.month, d.cohorts[d.cohorts.length - 1]?.month);
  const pointsFor = (days: 30 | 90) =>
    months.map((month) => {
      const c = byMonth.get(month);
      const value =
        c && mature(c, days) ? rate(days === 30 ? c.retained30 : c.retained90, days === 30 ? c.eligible30 : c.eligible90) : null;
      return { date: month, value };
    });
  const series: LineSeries[] = [
    { key: "r30", label: "Siguen al mes", color: "var(--blue)", points: pointsFor(30) },
    { key: "r90", label: "Siguen a los 3 meses", color: "var(--red)", points: pointsFor(90) },
  ];

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
      <PageHeader
        personaje="punto-estrella"
        title="Retención"
        description="Cuántos de los que se suscriben siguen al mes y a los 3 meses, y cómo se comportan en ese tiempo."
        scope="Totales: altas de los últimos 12 meses"
      />
      <SubscriberTabs active="retencion" />

      <StatTiles tiles={tiles} />

      <section className="mb-16">
        <h2 className="mb-1 font-display text-xl font-semibold">Retención por mes de alta</h2>
        <p className="mb-6 max-w-3xl text-sm text-ink-muted">
          De los que se suscribieron cada mes, qué porcentaje seguía suscripto 30 y 90 días después. Una cohorte
          aparece cuando todas sus altas ya cumplieron el plazo. Sale de las fechas de alta y baja, así que cubre todo
          el histórico; no incluye a quien fue borrado de la lista en Substack.
        </p>
        {series.some((s) => s.points.some((p) => p.value != null)) ? (
          <MultiLineChart series={series} title="Retención a 1 y 3 meses por mes de alta" percent keepEmptyDates />
        ) : (
          <p className="text-sm text-ink-muted">Todavía no hay cohortes con 30 días cumplidos.</p>
        )}
        <CohortTable cohorts={d.cohorts} />
      </section>

      <section className="mb-16">
        <h2 className="mb-1 font-display text-xl font-semibold">Los primeros meses: ¿qué hacen los que se quedan?</h2>
        <p className="mb-6 max-w-3xl text-sm text-ink-muted">
          Actividad en el primer mes y en el tercero, comparando a quienes seguían suscriptos a los 90 días con
          quienes se fueron antes. Sale de las cargas automáticas (hace falta una carga cerca del día 30 o 90 de cada
          suscriptor), así que se llena a medida que se suman cargas: los suscriptores anteriores a las cargas
          automáticas no tienen estos datos.
        </p>
        <EarlyEngagement rows={d.early} />
      </section>
    </main>
  );
}

function monthRange(first: string | undefined, last: string | undefined): string[] {
  if (!first || !last) return [];
  const months: string[] = [];
  let [year, month] = first.split("-").map(Number);
  const [lastYear, lastMonth] = last.split("-").map(Number);
  while (year < lastYear || (year === lastYear && month <= lastMonth)) {
    months.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

function CohortTable({ cohorts }: { cohorts: CohortRow[] }) {
  if (cohorts.length === 0) return null;
  const rows = [...cohorts].reverse();
  const cell = (part: number, whole: number) =>
    whole === 0 ? <span className="text-ink-muted">aún no</span> : formatPercent(rate(part, whole));
  return (
    <details className="mt-6">
      <summary className="cursor-pointer text-sm text-ink-secondary hover:text-ink">Tabla completa por mes (con conversión a pago)</summary>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[620px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-ink-muted">
              <th className="px-2 py-2 font-medium">Mes de alta</th>
              <th className="px-2 py-2 text-right font-medium">Altas</th>
              <th className="px-2 py-2 text-right font-medium">Siguen al mes</th>
              <th className="px-2 py-2 text-right font-medium">Siguen a los 3 meses</th>
              <th className="px-2 py-2 text-right font-medium">Pagan en 1 mes</th>
              <th className="px-2 py-2 text-right font-medium">Pagan en 3 meses</th>
            </tr>
          </thead>
          <tbody className="tnum">
            {rows.map((c) => (
              <tr key={c.month} className="border-b border-line/60">
                <td className="px-2 py-2">{c.month}</td>
                <td className="px-2 py-2 text-right">{formatNumber(c.signups)}</td>
                <td className="px-2 py-2 text-right">{cell(c.retained30, c.eligible30)}</td>
                <td className="px-2 py-2 text-right">{cell(c.retained90, c.eligible90)}</td>
                <td className="px-2 py-2 text-right">{cell(c.paid30, c.eligible30)}</td>
                <td className="px-2 py-2 text-right">{cell(c.paid90, c.eligible90)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

const OUTCOME_LABEL: Record<EarlyEngagementRow["outcome"], string> = {
  retained: "Seguían a los 90 días",
  churned: "Se fueron antes de 90 días",
  pending: "Todavía sin 90 días",
};

function EarlyEngagement({ rows }: { rows: EarlyEngagementRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="panel p-4 text-sm text-ink-muted">
        Todavía no hay datos: aparecen cuando un suscriptor nuevo cumple 30 días y hubo una carga cerca de esa fecha.
      </p>
    );
  }
  const avg = (value: number | null) => (value == null ? "—" : value.toFixed(1));
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {([30, 90] as const).map((day) => {
        const group = rows.filter((r) => r.day === day);
        return (
          <div key={day} className="panel overflow-x-auto p-4">
            <h3 className="mb-3 font-medium">{day === 30 ? "Primer mes (días 1–30)" : "Tercer mes (días 61–90)"}</h3>
            {group.length === 0 ? (
              <p className="text-sm text-ink-muted">Sin datos todavía.</p>
            ) : (
              <table className="w-full min-w-[420px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-ink-muted">
                    <th className="py-2 pr-2 font-medium">Grupo</th>
                    <th className="px-2 py-2 text-right font-medium">Personas</th>
                    <th className="px-2 py-2 text-right font-medium">Correos abiertos</th>
                    <th className="px-2 py-2 text-right font-medium">Posts leídos</th>
                    <th className="px-2 py-2 text-right font-medium">Días activos</th>
                  </tr>
                </thead>
                <tbody className="tnum">
                  {group.map((r) => (
                    <tr key={r.outcome} className="border-b border-line/60">
                      <td className="py-2 pr-2">
                        {OUTCOME_LABEL[r.outcome]}
                        {r.subscribers < MIN_SAMPLE && (
                          <span className="ml-1 text-xs text-ink-muted" title={`Menos de ${MIN_SAMPLE} personas`}>
                            (muestra chica)
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right">{formatNumber(r.subscribers)}</td>
                      <td className="px-2 py-2 text-right">{avg(r.avgEmailsOpened)}</td>
                      <td className="px-2 py-2 text-right">{avg(r.avgPostViews)}</td>
                      <td className="px-2 py-2 text-right">{avg(r.avgDaysActive)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="mt-3 text-xs text-ink-muted">Promedios por persona en los 30 días previos al corte.</p>
          </div>
        );
      })}
    </div>
  );
}
