"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/session";
import { query } from "@/lib/db";
import { parseIntValue, parseMoneyValue } from "@/lib/format";

export type UpdatePostInput = {
  postId: string;
  slug: string;
  snapshotId: string | null;
  title: string;
  author: string;
  postType: string;
  extraPostTypes: string[];
  publishedAt: string;
  views: string;
  newSubscribers: string;
  openRate: string;
  clickToOpenRate: string;
  engagement: string;
  estimatedValue: string;
};

export type UpdatePostResult = { error: string | null };

// Convierte un porcentaje ingresado a mano (ej. "45.2") a la fracción que
// guardamos en la base (0.452). Los campos de métricas del formulario de
// edición siempre se muestran y capturan en porcentaje.
function percentToFraction(value: string): number | null {
  if (value.trim() === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num / 100 : null;
}

// Corrección manual de un post: el snapshot importado a veces trae datos
// mal cargados (columna corrida, número mal tipeado, etc.) y no siempre
// vale la pena rehacer una carga entera para arreglar una sola fila.
export async function updatePost(input: UpdatePostInput): Promise<UpdatePostResult> {
  try {
    await requireSession();

    const title = input.title.trim();
    if (!title) return { error: "El título no puede quedar vacío." };

    // Las categorías adicionales no repiten la principal ni se repiten entre
    // sí (ver migración 0006).
    const postType = input.postType.trim() || null;
    const extraPostTypes = Array.from(
      new Set(input.extraPostTypes.map((t) => t.trim()).filter((t) => t && t !== postType))
    );

    try {
      await query(
        `update posts
         set title = $2, author = $3, post_type = $4, extra_post_types = $5, published_at = $6, updated_at = now()
         where id = $1`,
        [input.postId, title, input.author.trim() || null, postType, extraPostTypes, input.publishedAt || null]
      );
    } catch (err) {
      return { error: `No se pudo guardar el post: ${err instanceof Error ? err.message : String(err)}` };
    }

    if (input.snapshotId) {
      try {
        await query(
          `update metric_snapshots
           set views = $2, new_subscribers = $3, open_rate = $4, click_to_open_rate = $5,
               engagement = $6, estimated_value = $7
           where id = $1`,
          [
            input.snapshotId,
            parseIntValue(input.views),
            parseIntValue(input.newSubscribers),
            percentToFraction(input.openRate),
            percentToFraction(input.clickToOpenRate),
            percentToFraction(input.engagement),
            parseMoneyValue(input.estimatedValue),
          ]
        );
      } catch (err) {
        return { error: `No se pudo guardar las métricas: ${err instanceof Error ? err.message : String(err)}` };
      }
    }

    revalidatePath("/");
    revalidatePath("/rankings");
    revalidatePath("/dashboards");
    revalidatePath("/promedios");
    revalidatePath(`/post/${input.slug}`);

    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo guardar los cambios." };
  }
}
