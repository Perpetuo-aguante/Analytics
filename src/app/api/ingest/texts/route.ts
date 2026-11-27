import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { checkIngestKey, IngestError, logIngestRun } from "@/lib/ingest";
import { listTextStatus, prepareText, resolvePost, savePostText, type PostRef } from "@/lib/texts";
import { getStoredText, parseAnalysis, savePostAnalysis, type ParsedAnalysis, type SaveAnalysisResult } from "@/lib/compass-analysis";

// Textos completos de los posts y su lectura del compass, para el agente
// (Grok). Ver docs/ingest-api.md → "Textos y compass".
//
// GET  /api/ingest/texts                    estado de cada post: texto y lectura
// GET  /api/ingest/texts?faltan=1&limite=N  solo lo pendiente (los N más recientes)
// GET  /api/ingest/texts/guia               la guía de lectura (rúbricas y formato)
// POST /api/ingest/texts                    sube textos y/o su lectura (`analisis`)
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Cuántos textos acepta una sola request (JSON con `textos`).
const MAX_ITEMS = 50;

export async function GET(request: NextRequest) {
  const denied = checkIngestKey(request);
  if (denied) return denied;
  const params = request.nextUrl.searchParams;
  const onlyMissing = ["1", "true"].includes(params.get("faltan") ?? "");
  const limit = Number(params.get("limite"));
  const all = await listTextStatus();
  let posts = onlyMissing ? all.filter((p) => !p.tiene_texto || !p.analizado) : all;
  // Para ir cargando el histórico por tandas sin gastar de más: los N más
  // recientes de lo pendiente.
  if (Number.isInteger(limit) && limit > 0) posts = posts.slice(0, limit);
  return NextResponse.json({
    ok: true,
    total: all.length,
    conTexto: all.filter((p) => p.tiene_texto).length,
    analizados: all.filter((p) => p.analizado).length,
    posts,
  });
}

type RawItem = PostRef & { texto?: unknown; archivo?: unknown; analisis?: unknown };

type ItemResult =
  | {
      ok: true;
      slug: string;
      titulo: string;
      encontradoPor: string;
      texto: "creado" | "actualizado" | "sin cambios" | "válido (prueba)" | "no enviado";
      palabras: number | null;
      analisis: SaveAnalysisResult["estado"] | "válida (prueba)" | "no enviada";
      // Campos con una cita que no está en el texto, y los que hay que
      // volver a mandar (una vez).
      evidenciaInvalida?: string[];
      reintentar?: string[];
    }
  | { ok: false; referencia: PostRef; error: string; sugerencias?: { slug: string; title: string }[] };

export async function POST(request: NextRequest) {
  const denied = checkIngestKey(request);
  if (denied) return denied;

  const source = request.headers.get("user-agent");
  const params = request.nextUrl.searchParams;
  let dryRun = ["1", "true"].includes(params.get("dryRun") ?? "");
  let items: RawItem[] = [];

  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        throw new IngestError("El body no es JSON válido.", 400);
      }
      const record = (body ?? {}) as Record<string, unknown>;
      if (record.dryRun === true) dryRun = true;
      items = Array.isArray(record.textos) ? (record.textos as RawItem[]) : [record as RawItem];
    } else if (contentType.startsWith("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      const text = file instanceof File ? await file.text() : (form.get("texto") as string | null);
      const analysisRaw = form.get("analisis") as string | null;
      let analysis: unknown;
      if (analysisRaw) {
        try {
          analysis = JSON.parse(analysisRaw);
        } catch {
          throw new IngestError("El campo `analisis` debe ser JSON.", 400);
        }
      }
      if (["1", "true"].includes((form.get("dryRun") as string | null) ?? "")) dryRun = true;
      items = [
        {
          slug: (form.get("slug") as string | null) ?? params.get("slug"),
          url: (form.get("url") as string | null) ?? params.get("url"),
          title: (form.get("title") as string | null) ?? params.get("title"),
          texto: text,
          archivo: file instanceof File ? file.name : null,
          analisis: analysis,
        },
      ];
    } else {
      // El .txt crudo en el body; el post va en la query string.
      const text = await request.text();
      items = [{ slug: params.get("slug"), url: params.get("url"), title: params.get("title"), texto: text }];
    }

    if (items.length === 0) throw new IngestError("No llegó ningún texto.", 400);
    if (items.length > MAX_ITEMS) throw new IngestError(`Máximo ${MAX_ITEMS} textos por request (llegaron ${items.length}).`, 400);

    const results: ItemResult[] = [];
    for (const item of items) results.push(await processItem(item, { dryRun, source }));

    const okCount = results.filter((r) => r.ok).length;
    const summary = {
      textos: results.length,
      guardados: okCount,
      fallidos: results.length - okCount,
      creados: results.filter((r) => r.ok && r.texto === "creado").length,
      actualizados: results.filter((r) => r.ok && r.texto === "actualizado").length,
      lecturas: results.filter((r) => r.ok && (r.analisis === "guardado" || r.analisis === "actualizado")).length,
      porReintentar: results.filter((r) => r.ok && (r.reintentar?.length ?? 0) > 0).length,
    };
    const allOk = okCount === results.length;
    await logIngestRun({
      kind: "texts",
      snapshotDate: null,
      ok: allOk,
      dryRun,
      rowCount: results.length,
      summary,
      error: allOk
        ? null
        : results
            .filter((r): r is Extract<ItemResult, { ok: false }> => !r.ok)
            .map((r) => `${r.referencia.slug ?? r.referencia.url ?? r.referencia.title ?? "?"}: ${r.error}`)
            .join(" · ")
            .slice(0, 2000),
      source,
    });

    if (!dryRun && okCount > 0) {
      revalidatePath("/textos");
      revalidatePath("/post/[slug]", "page");
    }

    // 200 si todo entró; 207 si entró una parte; el código del error si era
    // un solo texto y falló (para que un agente simple pueda mirar solo el
    // status).
    const status = allOk ? 200 : okCount > 0 ? 207 : items.length === 1 ? errorStatus(results[0]) : 422;
    return NextResponse.json({ ok: allOk, dryRun, summary, resultados: results }, { status });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = err instanceof IngestError ? err.status : 500;
    await logIngestRun({ kind: "texts", snapshotDate: null, ok: false, dryRun, rowCount: items.length || null, summary: null, error: message, source });
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

function errorStatus(result: ItemResult): number {
  if (result.ok) return 200;
  return result.sugerencias ? 404 : 422;
}

async function processItem(item: RawItem, opts: { dryRun: boolean; source: string | null }): Promise<ItemResult> {
  const ref: PostRef = { slug: str(item.slug), url: str(item.url), title: str(item.title) };
  try {
    if (!ref.slug && !ref.url && !ref.title) {
      throw new Error("Falta identificar el post: manda `slug`, `url` o `title`.");
    }
    const hasText = typeof item.texto === "string" && item.texto.trim() !== "";
    if (!hasText && item.analisis == null) throw new Error("No llegó ni `texto` ni `analisis`.");
    // Validar todo antes de tocar la base: si la lectura está mal formada,
    // no se guarda nada de ese post.
    const prepared = hasText ? prepareText(item.texto as string) : null;
    const analysis: ParsedAnalysis | null = item.analisis != null ? parseAnalysis(item.analisis) : null;

    const resolved = await resolvePost(ref);
    if (!resolved.post) {
      return {
        ok: false,
        referencia: ref,
        error:
          "No hay ningún post con ese slug, URL o título. Si es un post recién publicado, todavía no llegó en el export de métricas: reintenta después de la próxima carga.",
        sugerencias: resolved.suggestions,
      };
    }
    const post = resolved.post;

    if (opts.dryRun) {
      return {
        ok: true,
        slug: post.slug,
        titulo: post.title,
        encontradoPor: resolved.matchedBy,
        texto: prepared ? "válido (prueba)" : "no enviado",
        palabras: prepared?.wordCount ?? null,
        analisis: analysis ? "válida (prueba)" : "no enviada",
      };
    }

    const saved = hasText
      ? await savePostText(post.id, item.texto as string, { fileName: str(item.archivo), source: opts.source })
      : null;
    let reading: SaveAnalysisResult | null = null;
    if (analysis) {
      // La lectura se valida contra el texto guardado: el que llegó ahora o,
      // si llegó solo la lectura (un reintento), el que ya estaba.
      const target = saved ? { body: saved.body, content_hash: saved.hash } : await getStoredText(post.id);
      if (!target) throw new Error("Este post todavía no tiene texto: manda `texto` junto con `analisis`.");
      reading = await savePostAnalysis(post.id, target.content_hash, target.body, analysis);
    }

    return {
      ok: true,
      slug: post.slug,
      titulo: post.title,
      encontradoPor: resolved.matchedBy,
      texto: saved?.status ?? "no enviado",
      palabras: saved?.wordCount ?? null,
      analisis: reading?.estado ?? "no enviada",
      ...(reading && reading.invalidos.length > 0 ? { evidenciaInvalida: reading.invalidos } : {}),
      ...(reading && reading.reintentar.length > 0 ? { reintentar: reading.reintentar } : {}),
    };
  } catch (err) {
    return { ok: false, referencia: ref, error: err instanceof Error ? err.message : String(err) };
  }
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
