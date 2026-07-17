"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/server";
import { parseIntValue } from "@/lib/format";

export type UpdatePostInput = {
  postId: string;
  slug: string;
  snapshotId: string | null;
  title: string;
  author: string;
  postType: string;
  publishedAt: string;
  views: string;
  newSubscribers: string;
  openRate: string;
  clickToOpenRate: string;
  engagement: string;
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
    const supabase = createAdminClient();

    const title = input.title.trim();
    if (!title) return { error: "El título no puede quedar vacío." };

    const { error: postError } = await supabase
      .from("posts")
      .update({
        title,
        author: input.author.trim() || null,
        post_type: input.postType.trim() || null,
        published_at: input.publishedAt || null,
      })
      .eq("id", input.postId);
    if (postError) return { error: `No se pudo guardar el post: ${postError.message}` };

    if (input.snapshotId) {
      const { error: snapshotError } = await supabase
        .from("metric_snapshots")
        .update({
          views: parseIntValue(input.views),
          new_subscribers: parseIntValue(input.newSubscribers),
          open_rate: percentToFraction(input.openRate),
          click_to_open_rate: percentToFraction(input.clickToOpenRate),
          engagement: percentToFraction(input.engagement),
        })
        .eq("id", input.snapshotId);
      if (snapshotError) return { error: `No se pudo guardar las métricas: ${snapshotError.message}` };
    }

    revalidatePath("/");
    revalidatePath("/rankings");
    revalidatePath(`/post/${input.slug}`);

    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo guardar los cambios." };
  }
}
