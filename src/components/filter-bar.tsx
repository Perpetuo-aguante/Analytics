"use client";

// La barra de filtros: una sola fila de controles arriba de todo el
// contenido, que recorta TODO lo que hay debajo (tablas, rankings y charts a
// la vez, para que los números nunca se contradigan entre sí).
//
// Un clic aplica. No hay botón "Filtrar": cada chip navega solo, escribiendo
// su estado en la URL (ver lib/filters.ts). Eso hace que el filtro sea
// compartible, que el botón "atrás" del navegador deshaga filtros uno a uno,
// y que la nav pueda arrastrarlo de una sección a otra.

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { RANGE_PRESETS, serializeTypes, type Filters } from "@/lib/filters";
import { categoryShortLabel } from "@/lib/post-types";
import type { Category } from "@/lib/categories";

export function FilterBar({
  filters,
  categories,
  showSearch = false,
}: {
  filters: Filters;
  categories: Category[];
  showSearch?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // El recorte se calcula en el servidor, así que hay un viaje de ida y
  // vuelta por cada clic. isPending baja la opacidad del contenido en vez de
  // mostrar un esqueleto: el chart anterior se queda en su sitio y no salta
  // el layout mientras llega el nuevo.
  const [isPending, startTransition] = useTransition();

  function navigate(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    // Cambiar el recorte reinicia la paginación de cualquier lista de abajo.
    params.delete("pagina");
    const qs = params.toString();
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  function setRange(key: string | null) {
    navigate((params) => {
      // Un preset relativo y un rango absoluto son excluyentes: al elegir uno
      // hay que limpiar el otro o la URL queda describiendo dos recortes.
      params.delete("desde");
      params.delete("hasta");
      if (key == null) params.delete("rango");
      else params.set("rango", key);
    });
  }

  function toggleType(name: string) {
    const next = filters.types.includes(name)
      ? filters.types.filter((t) => t !== name)
      : [...filters.types, name];
    navigate((params) => {
      if (next.length === 0) params.delete("tipo");
      else params.set("tipo", serializeTypes(next, categories));
    });
  }

  function setCustomDate(field: "desde" | "hasta", value: string) {
    navigate((params) => {
      if (value) params.set(field, value);
      else params.delete(field);
      if (params.get("desde") || params.get("hasta")) params.set("rango", "custom");
      else params.delete("rango");
    });
  }

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get("q");
    navigate((params) => {
      const q = typeof value === "string" ? value.trim() : "";
      if (q) params.set("q", q);
      else params.delete("q");
    });
  }

  const anyActive = filters.range !== "todo" || filters.types.length > 0 || filters.q != null;

  return (
    <section
      aria-label="Filtros"
      data-pending={isPending ? "true" : undefined}
      className="panel mb-8 space-y-4 p-4 transition-opacity data-[pending=true]:opacity-60 sm:p-5"
    >
      {/* Fechas primero: es el filtro que todo el mundo toca antes que nada. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-semibold uppercase tracking-wider text-ink-muted">
          Cuándo
        </span>
        <button type="button" onClick={() => setRange(null)} className="chip" data-active={filters.range === "todo"}>
          Todo
        </button>
        {RANGE_PRESETS.map((preset) => (
          <button
            key={preset.key}
            type="button"
            onClick={() => setRange(preset.key)}
            className="chip"
            data-active={filters.range === preset.key}
          >
            {preset.label}
          </button>
        ))}

        {/* El rango a medida vive detrás de un desplegable: es el caso raro y
            no debe competir con los presets, que son el caso común. */}
        <details className="relative">
          <summary className="chip cursor-pointer list-none" data-active={filters.range === "custom"}>
            Fechas exactas
          </summary>
          <div className="panel-flat absolute left-0 top-full z-30 mt-2 w-64 space-y-3 p-4 shadow-lg">
            <label className="block text-xs text-ink-muted">
              Desde
              <input
                type="date"
                defaultValue={filters.range === "custom" ? (filters.from ?? "") : ""}
                onChange={(e) => setCustomDate("desde", e.target.value)}
                className="field mt-1 block w-full"
              />
            </label>
            <label className="block text-xs text-ink-muted">
              Hasta
              <input
                type="date"
                defaultValue={filters.range === "custom" ? (filters.to ?? "") : ""}
                onChange={(e) => setCustomDate("hasta", e.target.value)}
                className="field mt-1 block w-full"
              />
            </label>
          </div>
        </details>
      </div>

      {/* Tipos: multi-selección. Cada chip activo toma el color que ese tipo
          tiene en todos los charts, así el chip y el punto del scatter se
          leen como la misma cosa. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-semibold uppercase tracking-wider text-ink-muted">Qué</span>
        <button
          type="button"
          onClick={() => navigate((params) => params.delete("tipo"))}
          className="chip"
          data-active={filters.types.length === 0}
        >
          Todas las secciones
        </button>
        {categories.map((category) => {
          const active = filters.types.includes(category.name);
          return (
            <button
              key={category.id}
              type="button"
              onClick={() => toggleType(category.name)}
              className="chip"
              data-tone="type"
              data-active={active}
              aria-pressed={active}
              style={{ "--chip-color": category.color } as React.CSSProperties}
            >
              <span className="chip__dot" aria-hidden />
              {categoryShortLabel(category)}
            </button>
          );
        })}
      </div>

      {showSearch && (
        <form onSubmit={submitSearch} className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-semibold uppercase tracking-wider text-ink-muted">Buscar</span>
          <input
            type="search"
            name="q"
            defaultValue={filters.q ?? ""}
            placeholder="Título del post…"
            className="field min-w-[200px] flex-1"
          />
          <button type="submit" className="btn-primary text-sm">
            Buscar
          </button>
        </form>
      )}

      {anyActive && (
        <div className="flex items-center gap-3 border-t border-line pt-3">
          <button
            type="button"
            onClick={() =>
              navigate((params) => {
                for (const key of ["rango", "desde", "hasta", "tipo", "q"]) params.delete(key);
              })
            }
            className="text-xs font-medium text-blue underline underline-offset-2 hover:text-blue-deep"
          >
            Limpiar filtros
          </button>
        </div>
      )}
    </section>
  );
}
