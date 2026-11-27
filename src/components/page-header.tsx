// Encabezado común de cada sección. El subtítulo dice en palabras el recorte
// que está aplicado ("Últimos 30 días · Anteojos Editorial"), para que un
// número raro en pantalla se explique sin tener que mirar la barra de
// filtros ni la URL.
//
// Cada sección puede llevar un personaje de Perpetuo en el margen derecho,
// junto al título y sin taparlo, como pide el brandbook. En teléfono se
// omite: ahí el margen no existe.

import { Personaje, type PersonajeName } from "./personaje";

export function PageHeader({
  title,
  description,
  scope,
  personaje,
}: {
  title: string;
  description?: string;
  scope?: string;
  personaje?: PersonajeName;
}) {
  return (
    <header className="rise mb-10 flex items-end justify-between gap-8">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-ink-muted">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue" aria-hidden />
          Perpetuo Analítica
        </p>
        <h1 className="mt-3 font-display text-4xl font-medium sm:text-6xl">{title}</h1>
        {description && <p className="mt-4 max-w-2xl text-[0.9375rem] leading-relaxed text-ink-secondary">{description}</p>}
        {scope && (
          // El recorte va en un bloque lima: el color de "presencia" de la
          // marca, con texto negro encima (11.8:1).
          <p className="mt-4 inline-flex items-center rounded-full bg-lima px-3 py-1 text-xs font-medium text-ink">
            {scope}
          </p>
        )}
      </div>
      {personaje && (
        <div className="hidden shrink-0 md:block">
          <Personaje name={personaje} height={personaje === "punto-estrella" ? 84 : 128} priority />
        </div>
      )}
    </header>
  );
}
