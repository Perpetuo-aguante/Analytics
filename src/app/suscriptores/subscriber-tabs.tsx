import Link from "next/link";

// Las tres vistas de la sección de suscriptores. Van con `.chip` (el control
// de la app, que marca el activo con relleno + peso) y no con `.btn-secondary`,
// que quedó sin definición en el rediseño: con esa clase las pestañas se
// veían como texto suelto y no había forma de saber en cuál estabas.
export function SubscriberTabs({ active }: { active: "panel" | "geografia" | "lista" }) {
  return (
    <nav aria-label="Vistas de suscriptores" className="mb-8 flex flex-wrap gap-2 text-sm">
      <Link
        href="/suscriptores"
        className="chip"
        data-active={active === "panel"}
        aria-current={active === "panel" ? "page" : undefined}
      >
        Panel
      </Link>
      <Link
        href="/suscriptores/geografia"
        className="chip"
        data-active={active === "geografia"}
        aria-current={active === "geografia" ? "page" : undefined}
      >
        Geografía
      </Link>
      <Link
        href="/suscriptores/lista"
        className="chip"
        data-active={active === "lista"}
        aria-current={active === "lista" ? "page" : undefined}
      >
        Lista
      </Link>
    </nav>
  );
}
