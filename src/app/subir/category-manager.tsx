"use client";

import { useState, useTransition } from "react";
import { createCategory, deleteCategory, listCategories } from "./category-actions";
import type { Category } from "@/lib/categories";

// Panel de administración de categorías: crear/borrar las que se usan para
// filtrar y agrupar posts en toda la app (ver lib/post-types.ts). Vive en
// /subir junto con el resto de las herramientas de administración, detrás de
// la misma sesión.

export function CategoryManager({ initialCategories }: { initialCategories: Category[] }) {
  const [categories, setCategories] = useState(initialCategories);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function refresh() {
    startTransition(async () => {
      const result = await listCategories();
      if (result.data) setCategories(result.data);
    });
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createCategory(name);
      if (result.error) {
        setError(result.error);
        return;
      }
      setName("");
      refresh();
    });
  }

  function handleDelete(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await deleteCategory(id);
      if (result.error) {
        setError(result.error);
        setConfirmingId(null);
        return;
      }
      setConfirmingId(null);
      refresh();
    });
  }

  return (
    <div>
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-ink-muted">Categorías</h2>
      <p className="mb-4 text-sm text-ink-muted">
        Se usan para filtrar y agrupar posts en toda la app. El color y la forma de cada una se asignan solos —
        la paleta está validada por contraste y daltonismo, así que no se eligen a mano. Para borrar una hace
        falta recategorizar primero cualquier post que la esté usando (desde &quot;Corregir datos&quot; en la
        página de ese post).
      </p>

      <ul className="mb-4 space-y-2">
        {categories.map((category) => (
          <li key={category.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: category.color }}
                aria-hidden
              />
              {category.name}
            </span>
            {confirmingId === category.id ? (
              <span className="flex items-center gap-2 text-xs">
                <span className="text-ink-muted">¿Borrar?</span>
                <button
                  onClick={() => handleDelete(category.id)}
                  disabled={pending}
                  className="rounded-full bg-red-600 px-3 py-1 font-medium text-white disabled:opacity-50"
                >
                  Sí, borrar
                </button>
                <button
                  onClick={() => setConfirmingId(null)}
                  disabled={pending}
                  className="text-ink-muted underline"
                >
                  Cancelar
                </button>
              </span>
            ) : (
              <button
                onClick={() => setConfirmingId(category.id)}
                disabled={pending}
                className="text-xs text-red-600 underline disabled:opacity-50"
              >
                Borrar
              </button>
            )}
          </li>
        ))}
      </ul>

      <form onSubmit={handleCreate} className="flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nueva categoría (ej. Podcasts)"
          className="field flex-1"
        />
        <button type="submit" disabled={pending || !name.trim()} className="btn-primary text-sm">
          Agregar
        </button>
      </form>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
