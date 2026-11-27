"use server";

import { getCategories } from "@/lib/categories";
import { buildCorpusModel, compareDraft, getTextCorpus, MAX_TEXT_CHARS, type DraftComparison } from "@/lib/texts";

export type CompareResult = { error: string; comparison?: undefined } | { error: null; comparison: DraftComparison };

// Compara un borrador con todos los textos cargados. No guarda nada: el
// borrador no sale de esta request.
export async function compareText(text: string): Promise<CompareResult> {
  if (!text.trim()) return { error: "Pega un texto o sube un .txt." };
  if (text.length > MAX_TEXT_CHARS) return { error: "El texto es demasiado largo." };
  try {
    const [rows, categories] = await Promise.all([getTextCorpus(), getCategories()]);
    if (rows.length === 0) return { error: "Todavía no hay textos cargados con los que comparar." };
    return { error: null, comparison: compareDraft(buildCorpusModel(rows, categories), text) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo comparar el texto." };
  }
}
