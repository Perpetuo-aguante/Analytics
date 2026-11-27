// Encabezado de cada sección: un lienzo de color a todo el ancho, como los
// separadores de sección del Brandbook 2026 de Perpetuo (bloque plano de
// color, título grande encima). Cada sección tiene su lienzo, así que el
// color dice dónde estás antes que el texto.
//
// El subtítulo lima/negro dice en palabras el recorte aplicado ("Últimos 30
// días · Anteojos Editorial"), para que un número raro en pantalla se
// explique sin mirar la barra de filtros ni la URL.
//
// El personaje va al margen derecho, sin tapar el título. Los personajes son
// tinta negra con acentos rojos: sobre lienzos oscuros o rojos se paran
// dentro de un disco crema — el punto, la forma de la que nacen todos.

import Link from "next/link";
import { Personaje, type PersonajeName } from "./personaje";

export type Canvas = "azul" | "rojo" | "lima" | "negro" | "crema";

// Contrastes verificados: crema/azul 8.3:1 · negro/rojo 5.0:1 ·
// negro/lima 11.8:1 · crema/negro 17.6:1 · negro/crema 17.6:1.
const CANVAS: Record<
  Canvas,
  { bg: string; text: string; soft: string; pill: string; disc: boolean; dot: string }
> = {
  azul: { bg: "bg-azul", text: "text-crema", soft: "text-crema/80", pill: "bg-lima text-negro", disc: true, dot: "bg-lima" },
  rojo: { bg: "bg-rojo", text: "text-negro", soft: "text-negro/80", pill: "bg-negro text-crema", disc: true, dot: "bg-negro" },
  lima: { bg: "bg-lima", text: "text-negro", soft: "text-negro/80", pill: "bg-negro text-lima", disc: false, dot: "bg-azul" },
  negro: { bg: "bg-negro", text: "text-crema", soft: "text-crema/75", pill: "bg-lima text-negro", disc: true, dot: "bg-rojo" },
  crema: { bg: "bg-crema", text: "text-negro", soft: "text-ink-secondary", pill: "bg-lima text-negro", disc: false, dot: "bg-azul" },
};

export function PageHeader({
  title,
  description,
  scope,
  personaje,
  canvas = "crema",
  back,
}: {
  title: string;
  description?: string;
  scope?: string;
  personaje?: PersonajeName;
  canvas?: Canvas;
  // Enlace de vuelta para subpáginas ("← Compass editorial").
  back?: { href: string; label: string };
}) {
  const c = CANVAS[canvas];
  return (
    // A todo el ancho de la ventana aunque viva dentro del <main> centrado;
    // body corta el desborde horizontal (overflow-x: clip en globals.css).
    <header className={`page-canvas ${c.bg} ${c.text} -mt-12 mb-10 ml-[calc(50%-50vw)] w-screen`}>
      <div className="mx-auto flex max-w-6xl items-end justify-between gap-8 px-6 pb-12 pt-10 sm:pb-16 sm:pt-14">
        <div className="rise min-w-0">
          {back ? (
            <Link href={back.href} className={`text-sm font-medium ${c.soft} hover:underline`}>
              ← {back.label}
            </Link>
          ) : (
            <p className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] ${c.soft}`}>
              <span className={`inline-block h-2 w-2 rounded-full ${c.dot}`} aria-hidden />
              Perpetuo Analítica
            </p>
          )}
          <h1 className="display-title mt-4 text-[clamp(2.75rem,9vw,6.5rem)]">{title}</h1>
          {description && (
            <p className={`mt-5 max-w-2xl text-base leading-relaxed ${c.soft}`}>{description}</p>
          )}
          {scope && (
            <p className={`mt-5 inline-flex items-center rounded-full px-3.5 py-1.5 text-xs font-semibold ${c.pill}`}>
              {scope}
            </p>
          )}
        </div>
        {personaje && (
          <div className="hidden shrink-0 md:block">
            {c.disc ? (
              <div className="personaje-disc flex h-48 w-48 items-center justify-center rounded-full bg-crema lg:h-56 lg:w-56">
                <Personaje name={personaje} height={personaje === "punto-estrella" ? 76 : 132} priority />
              </div>
            ) : (
              <Personaje name={personaje} height={personaje === "punto-estrella" ? 96 : 168} priority />
            )}
          </div>
        )}
      </div>
    </header>
  );
}
