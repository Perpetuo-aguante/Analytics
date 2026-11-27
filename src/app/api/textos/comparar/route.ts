import { NextResponse, type NextRequest } from "next/server";
import { checkIngestKey } from "@/lib/ingest";
import { getCategories } from "@/lib/categories";
import { buildCorpusModel, compareDraft, getTextCorpus, MAX_TEXT_CHARS } from "@/lib/texts";

// POST /api/textos/comparar — lo mismo que /textos/comparar, por HTTP: dado un
// texto nuevo (que no se guarda), devuelve a qué textos de Perpetuo se parece,
// su lugar estimado en el compass y la sección más probable.
// Usa la misma clave que la API de ingesta (INGEST_API_KEY). Ver
// docs/ingest-api.md → "Comparar un texto nuevo".
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const denied = checkIngestKey(request);
  if (denied) return denied;

  let text: string;
  if ((request.headers.get("content-type") ?? "").includes("application/json")) {
    const body = (await request.json().catch(() => null)) as { texto?: unknown } | null;
    text = typeof body?.texto === "string" ? body.texto : "";
  } else {
    text = await request.text();
  }
  if (!text.trim()) return NextResponse.json({ ok: false, error: "Falta el texto." }, { status: 400 });
  if (text.length > MAX_TEXT_CHARS) return NextResponse.json({ ok: false, error: "El texto es demasiado largo." }, { status: 400 });

  const [rows, categories] = await Promise.all([getTextCorpus(), getCategories()]);
  if (rows.length === 0) return NextResponse.json({ ok: false, error: "Todavía no hay textos cargados para comparar." }, { status: 409 });
  const comparison = compareDraft(buildCorpusModel(rows, categories), text);
  return NextResponse.json({ ok: true, corpus: rows.length, ...comparison });
}
