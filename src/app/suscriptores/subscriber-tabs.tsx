import Link from "next/link";

export function SubscriberTabs({ active }: { active: "panel" | "lista" }) {
  return (
    <div className="mb-8 flex gap-2 text-sm">
      <Link href="/suscriptores" data-active={active === "panel"} className="btn-secondary">
        Panel
      </Link>
      <Link href="/suscriptores/lista" data-active={active === "lista"} className="btn-secondary">
        Lista
      </Link>
    </div>
  );
}
