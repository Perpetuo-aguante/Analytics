// Fila de cifras "de un vistazo" del recorte activo. Un stat tile no lleva
// hover ni tooltip: el número ya está escrito completo.
export type StatTile = { label: string; value: string; hint?: string };

export function StatTiles({ tiles }: { tiles: StatTile[] }) {
  return (
    <section className="mb-10 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((tile) => (
        <div key={tile.label} className="panel p-4">
          <p className="text-xs text-ink-muted">{tile.label}</p>
          <p className="tnum mt-1.5 font-display text-3xl font-semibold">{tile.value}</p>
          {tile.hint && <p className="mt-1 text-xs text-ink-muted">{tile.hint}</p>}
        </div>
      ))}
    </section>
  );
}
