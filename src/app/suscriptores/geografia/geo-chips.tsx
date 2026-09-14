"use client";

// Chips que escriben su estado en la URL, igual que la barra de filtros de
// las secciones de posts: un clic navega, el enlace es compartible y el
// botón "atrás" deshace un cambio a la vez. Sirve para los dos selectores de
// esta página (la ventana de tiempo y el país del desglose por provincia),
// que son el mismo control con distinta clave.

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

export type ChipOption = { key: string; label: string };

export function GeoChips({
  label,
  param,
  options,
  active,
}: {
  label: string;
  param: string;
  options: ChipOption[];
  active: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function select(key: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(param, key);
    startTransition(() => router.push(`${pathname}?${params.toString()}`, { scroll: false }));
  }

  return (
    <div
      data-pending={isPending ? "true" : undefined}
      className="flex flex-wrap items-center gap-2 transition-opacity data-[pending=true]:opacity-60"
    >
      <span className="mr-1 text-xs font-semibold uppercase tracking-wider text-ink-muted">{label}</span>
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          onClick={() => select(option.key)}
          className="chip"
          data-active={option.key === active}
          aria-pressed={option.key === active}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
