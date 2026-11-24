"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/session";
import { query } from "@/lib/db";
import { normalizeHeader } from "@/lib/columns";
import { slugify } from "@/lib/format";
import { autoStyleForIndex, getCategories, type Category } from "@/lib/categories";
import { matchPostCategories } from "@/lib/post-types";

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

    const existing = await query<{ name: string }>("select name from post_categories");

    const normalized = normalizeHeader(trimmed);
    if (existing.some((c) => normalizeHeader(c.name) === normalized)) {
      return { error: "Ya existe una categoría con ese nombre." };
    }

    const count = existing.length;
    const style = autoStyleForIndex(count);
    await query(
      "insert into post_categories (name, slug, color, shape, sort_order) values ($1, $2, $3, $4, $5)",
      [trimmed, slugify(trimmed), style.color, style.shape, count + 1]
    );

    revalidatePath("/", "layout");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo crear la categoría." };
  }
}

// Borra una categoría — solo si ningún post la usa hoy, ni como principal ni
// como adicional (matcheando alias
// como matchPostType, no por igualdad exacta, para no dejar pasar posts que
// la usan bajo un nombre histórico distinto). No hay fusión automática: si
// hay posts con esa categoría, hay que recategorizarlos primero desde
// "Corregir datos" en /post/[slug] (ver edit-form.tsx).
export async function deleteCategory(id: string): Promise<CategoryActionResult> {
  try {
    await requireSession();
    const categories = await getCategories();
    const category = categories.find((c) => c.id === id);
    if (!category) return { error: "Esa categoría ya no existe." };

    const posts = await query<{ post_type: string | null; extra_post_types: string[] }>(
      "select post_type, extra_post_types from posts"
    );

    const inUseCount = posts.filter((p) =>
      matchPostCategories(p.post_type, p.extra_post_types, categories).some((c) => c.id === id)
    ).length;
    if (inUseCount > 0) {
      return {
        error: `${inUseCount} post(s) todavía tienen la categoría "${category.name}". Recategorízalos desde "Corregir datos" antes de borrarla.`,
      };
    }

    await query("delete from post_categories where id = $1", [id]);

    revalidatePath("/", "layout");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo borrar la categoría." };
  }
}
