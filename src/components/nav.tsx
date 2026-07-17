import Link from "next/link";

export function Nav() {
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
        <Link href="/" className="font-serif text-lg font-semibold tracking-tight">
          Perpetuo · Analítica
        </Link>
        <nav className="flex items-center gap-2 text-sm text-muted">
          <Link href="/" className="rounded-full px-3 py-1.5 hover:bg-accent/10 hover:text-foreground">
            Posts
          </Link>
          <Link href="/rankings" className="rounded-full px-3 py-1.5 hover:bg-accent/10 hover:text-foreground">
            Rankings
          </Link>
          <Link href="/subir" className="btn-primary px-4 py-1.5 text-xs">
            Cargar
          </Link>
        </nav>
      </div>
    </header>
  );
}
