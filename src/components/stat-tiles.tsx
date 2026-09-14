// Fila de cifras "de un vistazo" del recorte activo. Un stat tile no lleva
// hover ni tooltip: el número ya está escrito completo.
//
// El valor puede ser una cifra o un nombre ("Argentina", "Sudamérica"). Un
// nombre necesita menos cuerpo y poder partirse: a 3xl, "Sudamérica" no
// entra en la tarjeta de un teléfono y empujaba la página entera a scroll
// horizontal. De ahí la variante "text".
export type StatTile = { label: string; value: string; hint?: string; variant?: "number" | "text" };

export function StatTiles({ tiles }: { tiles: StatTile[] }) {
  return (
    <section className="mb-10 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((tile) => (
        <div key={tile.label} className="panel p-4">
          <p className="text-xs text-ink-muted">{tile.label}</p>
          <p
            className={`mt-1.5 font-display font-semibold ${
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
