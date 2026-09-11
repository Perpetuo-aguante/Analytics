"use client";

// La nav arrastra los filtros entre secciones: si vienes de Posts con
// "30 días + Anteojos" aplicado y tocas Rankings, llegas a Rankings con el
// mismo recorte en vez de volver a empezar. Por eso es client component —
// necesita leer los searchParams actuales, que un layout server no recibe.

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";

const SECTIONS = [
  { href: "/", label: "Posts" },
  { href: "/rankings", label: "Rankings" },
  { href: "/dashboards", label: "Dashboards" },
  { href: "/promedios", label: "Promedios" },
  { href: "/suscriptores", label: "Suscriptores" },
] as const;

// Las claves que viajan de una sección a otra. Todo lo demás (orden de una
// tabla, métrica de un ranking, pestaña abierta) es local a su página y se
// deja atrás a propósito.
const CARRIED_PARAMS = ["rango", "desde", "hasta", "tipo", "q"] as const;

function NavLinks() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const carried = new URLSearchParams();
  for (const key of CARRIED_PARAMS) {
    const value = searchParams.get(key);
    if (value) carried.set(key, value);
  }
  const suffix = carried.toString() ? `?${carried.toString()}` : "";

  return (
    // En pantalla chica los seis destinos no caben en una línea: la nav se
    // vuelve una tira deslizable en vez de desbordar la página entera.
    <nav className="-mx-1 flex max-w-full items-center gap-1 overflow-x-auto px-1 text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {SECTIONS.map((section) => {
        const isActive =
          section.href === "/" ? pathname === "/" : pathname.startsWith(section.href);
        return (
          <Link
            key={section.href}
            href={`${section.href}${suffix}`}
            aria-current={isActive ? "page" : undefined}
            className={`shrink-0 rounded-full px-3 py-1.5 transition-colors ${
              isActive
                ? "bg-blue text-on-brand font-semibold"
                : "text-ink-secondary hover:bg-blue/10 hover:text-ink"
            }`}
          >
            {section.label}
          </Link>
        );
      })}
      <Link href="/subir" className="btn-primary ml-1 shrink-0 px-4 py-1.5 text-xs">
        Cargar
      </Link>
    </nav>
  );
}

export function Nav() {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-6 py-3">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <span className="inline-block h-5 w-5 rounded-full bg-blue" aria-hidden />
          <span className="font-display text-base font-semibold tracking-tight">
            Perpetuo <span className="text-ink-muted">Analítica</span>
          </span>
        </Link>
        {/* useSearchParams necesita un límite de Suspense; el fallback es la
            propia nav sin los filtros arrastrados, no un hueco vacío. */}
        <Suspense fallback={<div className="h-[34px]" />}>
          <NavLinks />
        </Suspense>
      </div>
    </header>
  );
}
