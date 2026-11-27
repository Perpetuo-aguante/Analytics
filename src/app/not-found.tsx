import Link from "next/link";
import { Personaje } from "@/components/personaje";

// La exclamación aparece cuando algo merece atención: una dirección que no
// lleva a ningún lado lo merece.
export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-6 px-6 py-24 text-center">
      <Personaje name="exclamacion-foco" height={160} />
      <div>
        <h1 className="font-display text-4xl font-medium">Esta página no existe</h1>
        <p className="mt-3 text-ink-secondary">Puede que el post se haya borrado o que el enlace esté mal escrito.</p>
      </div>
      <Link href="/" className="btn-primary">
        Volver a las publicaciones
      </Link>
    </main>
  );
}
