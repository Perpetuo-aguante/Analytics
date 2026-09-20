"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/server";
import { normalizeHeader } from "@/lib/columns";
import { slugify } from "@/lib/format";
import { autoStyleForIndex, getCategories, type Category } from "@/lib/categories";
import { matchPostType } from "@/lib/post-types";

export type CategoryActionResult = { error: string | null };

export async function listCategories(): Promise<{ data: Category[] | null; error: string | null }> {
  try {
    const categories = await getCategories();
    return { data: categories, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : "No se pudieron cargar las categorías." };
  }
}

// Crea una categoría nueva. El color y la forma se asignan automáticamente
// (ver autoStyleForIndex) en vez de dejar elegir: la paleta de 7 colores está
// validada por contraste/daltonismo (ver lib/categories.ts) y dejar elegir
// cualquier hex la rompería.
export async function createCategory(name: string): Promise<CategoryActionResult> {
  try {
    await requireSession();
    const trimmed = name.trim();
    if (!trimmed) return { error: "El nombre no puede quedar vacío." };

    const supabase = createAdminClient();
    const { data: existing, error: existingError } = await supabase.from("post_categories").select("name");
    if (existingError) return { error: existingError.message };

    const normalized = normalizeHeader(trimmed);
    if ((existing ?? []).some((c) => normalizeHeader(c.name as string) === normalized)) {
      return { error: "Ya existe una categoría con ese nombre." };
    }

    const count = (existing ?? []).length;
    const style = autoStyleForIndex(count);
    const { error } = await supabase.from("post_categories").insert({
      name: trimmed,
      slug: slugify(trimmed),
      color: style.color,
      shape: style.shape,
      sort_order: count + 1,
    });
    if (error) return { error: error.message };

    revalidatePath("/", "layout");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo crear la categoría." };
  }
}

// Borra una categoría — solo si ningún post la usa hoy (matcheando alias
// como matchPostType, no por igualdad exacta, para no dejar pasar posts que
// la usan bajo un nombre histórico distinto). No hay fusión automática: si
// hay posts con esa categoría, hay que recategorizarlos primero desde
// "Corregir datos" en /post/[slug] (ver edit-form.tsx).
export async function deleteCategory(id: string): Promise<CategoryActionResult> {
  try {
    await requireSession();
    const supabase = createAdminClient();

    const categories = await getCategories();
    const category = categories.find((c) => c.id === id);
    if (!category) return { error: "Esa categoría ya no existe." };

    const { data: posts, error: postsError } = await supabase.from("posts").select("post_type");
    if (postsError) return { error: postsError.message };

    const inUseCount = (posts ?? []).filter(
      (p) => matchPostType(p.post_type as string | null, categories)?.id === id
    ).length;
    if (inUseCount > 0) {
      return {
        error: `${inUseCount} post(s) todavía tienen la categoría "${category.name}". Recategorízalos desde "Corregir datos" antes de borrarla.`,
      };
    }

    const { error } = await supabase.from("post_categories").delete().eq("id", id);
    if (error) return { error: error.message };

    revalidatePath("/", "layout");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo borrar la categoría." };
  }
}
