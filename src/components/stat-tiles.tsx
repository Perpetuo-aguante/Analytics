// Fila de cifras "de un vistazo" del recorte activo. Un stat tile no lleva
// hover ni tooltip: el número ya está escrito completo.
//
// El valor puede ser una cifra o un nombre ("Argentina", "Sudamérica"). Un
// nombre necesita menos cuerpo y poder partirse: a 3xl, "Sudamérica" no
// entra en la tarjeta de un teléfono y empujaba la página entera a scroll
// horizontal. De ahí la variante "text".
export type StatTile = {
  label: string;
  value: string;
  hint?: string;
  variant?: "number" | "text";
  // Color del acento superior y del halo; por defecto el azul de marca.
  accent?: string;
};

// Cuando nadie pasa acento, las tarjetas alternan azul y rojo de marca: la
// fila se lee como un conjunto con ritmo, no como cinco cajas iguales.
const DEFAULT_ACCENTS = ["var(--blue)", "var(--red)", "var(--blue-deep)", "var(--blue)", "var(--red)"];

export function StatTiles({ tiles }: { tiles: StatTile[] }) {
  return (
    <section className={`mb-10 grid grid-cols-2 gap-3 ${tiles.length === 5 ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
      {tiles.map((tile, index) => (
        <div
          key={tile.label}
          className="panel panel-lift stat-tile p-4 sm:p-5"
          style={{ "--tile-accent": tile.accent ?? DEFAULT_ACCENTS[index % DEFAULT_ACCENTS.length] } as React.CSSProperties}
        >
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-ink-muted">{tile.label}</p>
          <p
            className={`mt-2 font-display font-semibold tracking-tight ${
              tile.variant === "text" ? "break-words text-xl" : "tnum text-3xl"
            }`}
          >
            {tile.value}
          </p>
          {tile.hint && <p className="mt-1 text-xs text-ink-muted">{tile.hint}</p>}
        </div>
      ))}
    </section>
  );
}
