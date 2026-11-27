import { type NextRequest } from "next/server";
import { checkIngestKey } from "@/lib/ingest";
import { COMPASS_GUIDE } from "@/lib/compass-guide";

// GET /api/ingest/texts/guia — la guía de lectura del compass (rúbricas,
// campos, vocabularios y forma del JSON), en Markdown. El agente la lee una
// vez por corrida, antes de analizar. Ver lib/compass-guide.ts.
export async function GET(request: NextRequest) {
  const denied = checkIngestKey(request);
  if (denied) return denied;
  return new Response(COMPASS_GUIDE, { headers: { "content-type": "text/markdown; charset=utf-8" } });
}
