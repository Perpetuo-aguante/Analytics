import Link from "next/link";

export function Nav() {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
        <Link href="/" className="font-serif text-lg font-semibold">
          Perpetuo · Analítica
        </Link>
        <nav className="flex gap-6 text-sm text-muted">
          <Link href="/" className="hover:text-foreground">
            Posts
          </Link>
          <Link href="/rankings" className="hover:text-foreground">
            Rankings
          </Link>
          <Link href="/subir" className="hover:text-foreground">
            Cargar
          </Link>
        </nav>
      </div>
    </header>
  );
}
