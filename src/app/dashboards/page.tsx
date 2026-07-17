import { getScatterMetrics, getSectionTimelines } from "@/lib/queries";
import { formatNumber, formatPercent } from "@/lib/display";
import { ScatterChart, type ScatterDatum } from "@/components/scatter-chart";
import { SectionTimelineChart, type TimelineSeries } from "@/components/section-timeline-chart";

export const dynamic = "force-dynamic";

export default async function DashboardsPage() {
  const [scatterMetrics, sectionTimelines] = await Promise.all([getScatterMetrics(), getSectionTimelines()]);

  const viewsVsSubscribers: ScatterDatum[] = scatterMetrics
    .filter((m) => m.views != null && m.newSubscribers != null)
    .map((m) => ({ id: m.postId, title: m.title, postType: m.postType, x: m.views as number, y: m.newSubscribers as number }));

  const engagementVsViews: ScatterDatum[] = scatterMetrics
    .filter((m) => m.views != null && m.engagement != null)
    .map((m) => ({ id: m.postId, title: m.title, postType: m.postType, x: m.views as number, y: m.engagement as number }));

  const openRateSeries: TimelineSeries[] = sectionTimelines.map(({ postType, points }) => ({
    postType,
    points: points.map((p) => ({ date: p.date, value: p.openRate })),
  }));

  const cumulativeViewsSeries: TimelineSeries[] = sectionTimelines.map(({ postType, points }) => ({
    postType,
    points: points.map((p) => ({ date: p.date, value: p.views })),
  }));

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-16">
      <header className="mb-12">
        <p className="text-sm uppercase tracking-wide text-muted">Perpetuo</p>
        <h1 className="mt-1 font-serif text-3xl font-semibold">Dashboards</h1>
        <p className="mt-2 text-sm text-muted">Basado en el snapshot más reciente de cada post, salvo donde se indica.</p>
      </header>

      <section className="mb-16">
        <h2 className="mb-1 font-serif text-xl font-semibold">Views vs. nuevos suscriptores</h2>
        <p className="mb-6 text-sm text-muted">Un punto por post. Toca un tipo en la leyenda para ocultarlo/mostrarlo.</p>
        <ScatterChart data={viewsVsSubscribers} xLabel="Views" yLabel="Nuevos suscriptores" formatX={formatNumber} formatY={formatNumber} />
      </section>

      <section className="mb-16">
        <h2 className="mb-1 font-serif text-xl font-semibold">Engagement vs. views</h2>
        <p className="mb-6 text-sm text-muted">
          Útil para encontrar posts con pocas views pero mucho engagement, o al revés.
        </p>
        <ScatterChart data={engagementVsViews} xLabel="Views" yLabel="Engagement" formatX={formatNumber} formatY={formatPercent} />
      </section>

      <section className="mb-16">
        <h2 className="mb-1 font-serif text-xl font-semibold">Open rate histórico por sección</h2>
        <p className="mb-6 text-sm text-muted">
          Promedio de open rate por carga semanal, solo para los tipos que se envían por newsletter.
        </p>
        <SectionTimelineChart series={openRateSeries} percent />
      </section>

      <section>
        <h2 className="mb-1 font-serif text-xl font-semibold">Views acumuladas por sección</h2>
        <p className="mb-6 text-sm text-muted">Suma de views de todos los posts de cada sección, por carga semanal.</p>
        <SectionTimelineChart series={cumulativeViewsSeries} />
      </section>
    </main>
  );
}
