import { NextRequest, NextResponse } from "next/server";
import { createAnonClient } from "@/lib/supabase/server";
import { computeTenureDays } from "@/lib/subscriber-queries";
import { formatMoney, formatNumber, formatPercent, formatTenure } from "@/lib/display";
import type { CurrentSubscriberMetric } from "@/lib/supabase/types";

// Endpoint pensado para el workflow de n8n de bajas ("Perpetuo: Bajas
// Substack → Slack + Apollo Unsubs"): dado el email de un suscriptor que se
// dio de baja, devuelve todos los datos que tenemos de él/ella en Supabase
// junto con un resumen ya formateado en mrkdwn de Slack, para no duplicar
// esa lógica de formateo en el workflow.
//
// GET /api/subscribers/lookup?email=persona@dominio.com
// Header: x-api-key: <ANALYTICS_API_KEY>
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const expectedKey = process.env.ANALYTICS_API_KEY;
  if (!expectedKey) {
    // Fail closed: sin la variable configurada, no exponemos el endpoint.
    return NextResponse.json({ error: "ANALYTICS_API_KEY no está configurada en el servidor." }, { status: 500 });
  }
  if (request.headers.get("x-api-key") !== expectedKey) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const email = request.nextUrl.searchParams.get("email")?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "Falta el parámetro email." }, { status: 400 });
  }

  const supabase = createAnonClient();
  const { data, error } = await supabase
    .from("current_subscriber_metrics")
    .select("*")
    .eq("email", email)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({
      found: false,
      email,
      slackSummary: `🔴 *Se dio de baja de Perpetuo* | ${email}\n_No encontramos a este suscriptor en la última carga de la base — puede ser un email distinto al de su cuenta de Substack._`,
    });
  }

  const row = data as CurrentSubscriberMetric;
  const tenureDays = computeTenureDays(row.start_date, row.cancel_date);

  return NextResponse.json({
    found: true,
    subscriber: { ...row, tenureDays },
    slackSummary: buildSlackSummary(row, tenureDays),
  });
}

function buildSlackSummary(row: CurrentSubscriberMetric, tenureDays: number | null): string {
  const who = row.name ? `*${row.name}* (${row.email})` : `*${row.email}*`;
  const location = [row.country, row.state_province].filter(Boolean).join(" · ") || "país desconocido";
  const plan = row.stripe_plan ? `${row.type ?? "—"} (${row.stripe_plan})` : (row.type ?? "—");

  const lines = [
    `🔴 *Se dio de baja de Perpetuo* | ${row.email}`,
    who,
    `• Tipo: ${plan} · ${location}`,
    `• Suscriptor desde: ${row.start_date ?? "—"} · Antigüedad: ${formatTenure(tenureDays)}`,
    `• Revenue histórico: ${formatMoney(row.revenue)}`,
    `• Open rate (6m): ${formatPercent(row.open_rate_6mo)} · Click rate: ${formatPercent(row.click_rate)}`,
    `• Actividad (0-5): ${row.activity ?? "—"} · Post views: ${formatNumber(row.post_views)} · Días activos (30d): ${formatNumber(row.days_active_30d)}`,
  ];

  if (row.sections && row.sections.length > 0) {
    lines.push(`• Secciones seguidas: ${row.sections.join(", ")}`);
  }
  if (row.first_paid_date) {
    lines.push(`• Primer pago: ${row.first_paid_date}`);
  }

  return lines.join("\n");
}
