import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { parseDateValue } from "@/lib/format";

// Endpoint pensado para el mismo workflow de n8n que ya usa
// /api/subscribers/lookup ("Perpetuo: Bajas Substack → Slack + Apollo
// Unsubs"): hoy ese workflow detecta la baja y avisa por Slack, pero
// cancel_date en Supabase solo se actualiza con la próxima carga semanal del
// CSV completo de suscriptores (ver subir/subscriber-actions.ts) — hasta una
// semana de atraso en que la app "sepa" que alguien se dio de baja. Este
// endpoint deja que el mismo workflow anote la baja al momento, agregando un
// paso de HTTP Request después del aviso de Slack.
//
// Si el suscriptor ya existe en `subscribers` se actualiza; si todavía no lo
// conocíamos (se dio de baja antes de aparecer en ninguna carga) se crea con
// lo poco que sabemos (email + fecha de baja) — el resto de sus atributos se
// completa solo en la próxima carga semanal.
//
// POST /api/subscribers/cancel
// Header: x-api-key: <ANALYTICS_API_KEY>
// Body: { "email": "persona@dominio.com", "cancelDate"?: "2026-08-20" }
//   - cancelDate es opcional: si no se manda, se usa la fecha de hoy (UTC).
//   - Se puede mandar cancelDate: null a propósito para revertir una baja
//     (ej. si más adelante este mismo workflow también cubre reactivaciones).
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const expectedKey = process.env.ANALYTICS_API_KEY;
  if (!expectedKey) {
    // Fail closed: sin la variable configurada, no exponemos el endpoint.
    return NextResponse.json({ error: "ANALYTICS_API_KEY no está configurada en el servidor." }, { status: 500 });
  }
  if (request.headers.get("x-api-key") !== expectedKey) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body inválido: se esperaba JSON." }, { status: 400 });
  }
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Body inválido: se esperaba JSON." }, { status: 400 });
  }
  const record = body as Record<string, unknown>;

  const email = typeof record.email === "string" ? record.email.trim().toLowerCase() : "";
  if (!email) {
    return NextResponse.json({ error: "Falta el campo email." }, { status: 400 });
  }

  let cancelDate: string | null;
  if (!("cancelDate" in record) || record.cancelDate === undefined) {
    cancelDate = new Date().toISOString().slice(0, 10); // hoy, UTC
  } else if (record.cancelDate === null) {
    cancelDate = null;
  } else if (typeof record.cancelDate === "string") {
    cancelDate = parseDateValue(record.cancelDate);
    if (!cancelDate) {
      return NextResponse.json(
        { error: `No se pudo interpretar cancelDate: "${record.cancelDate}".` },
        { status: 400 }
      );
    }
  } else {
    return NextResponse.json({ error: "cancelDate debe ser una fecha en texto o null." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("subscribers").upsert({ email, cancel_date: cancelDate }, { onConflict: "email" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidatePath("/suscriptores");
  revalidatePath("/suscriptores/lista");

  return NextResponse.json({ ok: true, email, cancelDate });
}
