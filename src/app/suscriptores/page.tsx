import { getSubscriberDashboard } from "@/lib/subscriber-queries";
import { formatMoney, formatNumber, formatPercent, formatTenure } from "@/lib/display";
import { BarChart } from "@/components/bar-chart";
import { LineChart } from "@/components/line-chart";
import { SubscriberTabs } from "./subscriber-tabs";

export const dynamic = "force-dynamic";

export default async function SuscriptoresPage() {
  const d = await getSubscriberDashboard();

  const tiles = [
    { label: "Suscriptores totales", value: formatNumber(d.totalSubscribers) },
    { label: "Gratuitos", value: formatNumber(d.freeCount) },
    { label: "Pagos", value: formatNumber(d.paidCount) },
    { label: "Comp", value: formatNumber(d.compCount) },
    { label: "Cancelados", value: formatNumber(d.cancelledCount) },
    { label: "Ingresos totales", value: formatMoney(d.totalRevenue) },
    { label: "Open rate promedio", value: formatPercent(d.avgOpenRate) },
    { label: "Actividad promedio", value: d.avgActivity != null ? d.avgActivity.toFixed(1) : "—" },
  ];

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-16">
      <header className="mb-8">
        <p className="text-sm uppercase tracking-wide text-muted">Perpetuo</p>
        <h1 className="mt-1 font-serif text-3xl font-semibold">Suscriptores</h1>
        <p className="mt-2 text-sm text-muted">
          Basado en la carga más reciente de suscriptores. Sube el export de Substack desde{" "}
          <span className="font-medium">/subir</span> para mantenerlo al día.
        </p>
      </header>

      <SubscriberTabs active="panel" />

      <section className="mb-16 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-2xl border border-border p-4">
            <p className="text-xs text-muted">{tile.label}</p>
            <p className="mt-1 font-serif text-2xl font-semibold">{tile.value}</p>
          </div>
        ))}
      </section>

      <section className="mb-16">
        <h2 className="mb-1 font-serif text-xl font-semibold">Comparación: gratuitos vs. pagos</h2>
        <p className="mb-6 text-sm text-muted">Promedios de cada cohorte sobre el snapshot más reciente.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <CohortCard title="Gratuitos" stats={d.freeVsPaid.free} />
          <CohortCard title="Pagos" stats={d.freeVsPaid.paid} />
        </div>
      </section>

      <section className="mb-16">
        <h2 className="mb-1 font-serif text-xl font-semibold">Crecimiento neto acumulado</h2>
        <p className="mb-6 text-sm text-muted">
          Altas menos bajas por mes (según fecha de alta y de cancelación), acumulado.
        </p>
        {d.growthOverTime.length > 0 ? (
          <LineChart points={d.growthOverTime} height={200} />
        ) : (
          <p className="text-sm text-muted">Sin datos suficientes.</p>
        )}
      </section>

      <section className="grid gap-12 sm:grid-cols-2">
        <div>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted">Suscriptores por tipo</h2>
          <BarChart data={d.typeBreakdown} />
        </div>
        <div>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted">Preferencias de sección</h2>
          <BarChart data={d.sectionBreakdown} />
        </div>
        <div>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted">Top países</h2>
          <BarChart data={d.countryBreakdown} />
        </div>
        <div>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted">Distribución de actividad</h2>
          <BarChart data={d.activityBreakdown} />
        </div>
        <div>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted">Distribución de open rate</h2>
          <BarChart data={d.openRateBreakdown} />
        </div>
        <div>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted">Distribución de antigüedad</h2>
          <BarChart data={d.tenureBreakdown} />
        </div>
        {d.revenueByPlan.length > 0 && (
          <div className="sm:col-span-2">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted">Ingresos por plan</h2>
            <BarChart data={d.revenueByPlan} formatValue={formatMoney} />
          </div>
        )}
      </section>
    </main>
  );
}

function CohortCard({
  title,
  stats,
}: {
  title: string;
  stats: { count: number; avgOpenRate: number | null; avgActivity: number | null; avgPostViews: number | null; avgTenureDays: number | null };
}) {
  return (
    <div className="rounded-2xl border border-border p-5">
      <p className="mb-3 text-sm font-medium">
        {title} <span className="text-muted">· {formatNumber(stats.count)}</span>
      </p>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-muted">Open rate</dt>
          <dd className="font-medium">{formatPercent(stats.avgOpenRate)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Actividad</dt>
          <dd className="font-medium">{stats.avgActivity != null ? stats.avgActivity.toFixed(1) : "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Post views</dt>
          <dd className="font-medium">{formatNumber(stats.avgPostViews)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Antigüedad</dt>
          <dd className="font-medium">{formatTenure(stats.avgTenureDays)}</dd>
        </div>
      </dl>
    </div>
  );
}
