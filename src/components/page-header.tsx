// Encabezado común de cada sección. El subtítulo dice en palabras el recorte
// que está aplicado ("Últimos 30 días · Anteojos Editorial"), para que un
// número raro en pantalla se explique sin tener que mirar la barra de
// filtros ni la URL.
export function PageHeader({
  title,
  description,
  scope,
}: {
  title: string;
  description?: string;
  scope?: string;
}) {
  return (
    <header className="rise mb-8">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-muted">Perpetuo</p>
      <h1 className="mt-2 font-display text-4xl font-semibold sm:text-5xl">{title}</h1>
      {description && <p className="mt-3 max-w-2xl text-sm text-ink-secondary">{description}</p>}
      {scope && (
        <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1 text-xs text-ink-secondary">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue" aria-hidden />
          {scope}
        </p>
      )}
    </header>
  );
}
