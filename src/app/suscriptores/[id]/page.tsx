import Link from "next/link";
import { notFound } from "next/navigation";
import { getSubscriberById } from "@/lib/subscriber-queries";
import { formatMoney, formatNumber, formatPercent, formatTenure } from "@/lib/display";
import { LineChart, type ChartPoint } from "@/components/line-chart";
import type { SubscriberSnapshot } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export default async function SubscriberDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getSubscriberById(id);
  if (!detail) notFound();
  const { subscriber, history } = detail;

  const tiles = [
    { label: "Open rate (6m)", value: formatPercent(subscriber.open_rate_6mo) },
    { label: "Click rate", value: formatPercent(subscriber.click_rate) },
    { label: "Post views", value: formatNumber(subscriber.post_views) },
    { label: "Comentarios", value: formatNumber(subscriber.comments) },
    { label: "Shares", value: formatNumber(subscriber.shares) },
    { label: "Actividad (0-5)", value: subscriber.activity != null ? String(subscriber.activity) : "—" },
    { label: "Días activos (30d)", value: formatNumber(subscriber.days_active_30d) },
    { label: "Revenue", value: formatMoney(subscriber.revenue) },
  ];

  const openRatePoints: ChartPoint[] = history.map((h) => ({
    date: h.snapshot_date,
    value: openRateFor(h),
  }));
  const activityPoints: ChartPoint[] = history.map((h) => ({ date: h.snapshot_date, value: h.activity }));

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
      <Link href="/suscriptores/lista" className="text-sm text-muted hover:underline">
        ← Volver a la lista
      </Link>

      <h1 className="mt-4 font-serif text-3xl font-semibold">{subscriber.name || subscriber.email}</h1>
      {subscriber.name && <p className="mt-1 text-sm text-muted">{subscriber.email}</p>}
      <p className="mt-2 text-sm text-muted">
        {subscriber.type ?? "—"} · {subscriber.country || "sin país"}
        {subscriber.state_province ? ` (${subscriber.state_province})` : ""}
      </p>

      <div className="mt-6 rounded-2xl border border-border p-5 text-sm">
        <p>
          Suscriptor desde <span className="font-medium">{subscriber.start_date ?? "—"}</span> (
          {formatTenure(subscriber.tenureDays)})
        </p>
        {subscriber.cancel_date && <p className="mt-1 text-red-700">Canceló el {subscriber.cancel_date}</p>}
        {subscriber.first_paid_date && (
          <p className="mt-1 text-muted">
            Primer pago: {subscriber.first_paid_date}
            {subscriber.stripe_plan ? ` · ${subscriber.stripe_plan}` : ""}
          </p>
        )}
        {subscriber.expiration_date && <p className="mt-1 text-muted">Vence: {subscriber.expiration_date}</p>}
      </div>

      {subscriber.sections && subscriber.sections.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Preferencias</h2>
          <div className="flex flex-wrap gap-2">
            {subscriber.sections.map((s) => (
              <span key={s} className="rounded-full border border-border px-3 py-1 text-xs text-muted">
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      <section className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-2xl border border-border p-4">
            <p className="text-xs text-muted">{tile.label}</p>
            <p className="mt-1 font-serif text-xl font-semibold">{tile.value}</p>
          </div>
        ))}
      </section>

      {history.length > 1 ? (
        <div className="mt-12 space-y-12">
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Open rate en el tiempo</h2>
            <LineChart points={openRatePoints} percent />
          </section>
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Actividad en el tiempo</h2>
            <LineChart points={activityPoints} />
          </section>
        </div>
      ) : (
        <p className="mt-12 text-sm text-muted">
          Todavía no hay más de una carga para este suscriptor — subí otro export para ver su evolución.
        </p>
      )}
    </main>
  );
}

function openRateFor(snapshot: SubscriberSnapshot): number | null {
  if (!snapshot.emails_received_6mo) return null;
  return (snapshot.emails_opened_6mo ?? 0) / snapshot.emails_received_6mo;
}
