"use client";

// La nav arrastra los filtros entre secciones: si vienes de Posts con
// "30 días + Anteojos" aplicado y tocas Rankings, llegas a Rankings con el
// mismo recorte en vez de volver a empezar. Por eso es client component —
// necesita leer los searchParams actuales, que un layout server no recibe.

import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";

const SECTIONS = [
  { href: "/", label: "Posts" },
  { href: "/rankings", label: "Rankings" },
  { href: "/dashboards", label: "Dashboards" },
  { href: "/promedios", label: "Promedios" },
  { href: "/tendencias", label: "Tendencias" },
  { href: "/textos", label: "Compass" },
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
    // En pantalla chica los siete destinos no caben en una línea: la nav se
    // vuelve una tira deslizable en vez de desbordar la página entera.
    <nav className="-mx-1 flex max-w-full items-center gap-5 overflow-x-auto px-1 pb-1.5 pt-1 text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {SECTIONS.map((section) => {
        const isActive =
          section.href === "/" ? pathname === "/" : pathname.startsWith(section.href);
        return (
          <Link
            key={section.href}
            href={`${section.href}${suffix}`}
            aria-current={isActive ? "page" : undefined}
            className="nav-link shrink-0 py-1"
          >
            {section.label}
          </Link>
        );
      })}
      <Link href="/subir" className="btn-primary shrink-0 px-4 py-1.5 text-xs">
        Cargar
      </Link>
    </nav>
  );
}

export function Nav() {
  return (
    // Como en el brandbook: logotipo a la izquierda, secciones a la derecha
    // y un filete azul de 2px a todo el ancho debajo (.site-header).
    <header className="site-header sticky top-0 z-20">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-6 py-3">
        <Link href="/" className="flex shrink-0 items-baseline gap-2.5" aria-label="Perpetuo Analítica, inicio">
          <Image
            src="/marca/perpetuo-logotipo.png"
            alt="Perpetuo"
            width={640}
            height={109}
            priority
            className="h-[18px] w-auto self-center"
          />
          <span className="text-sm text-ink-secondary">Analítica</span>
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
