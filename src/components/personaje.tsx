// Los personajes de Perpetuo: signos de puntuación convertidos en presencia
// (Brandbook 2026). No son decoración: cada uno dice algo sobre la pantalla
// en la que aparece, y siempre van al margen del contenido, nunca encima.
//
//   punto-corriendo        energía, arranque — lo que se mueve (posts, tendencias)
//   punto-estrella         pausa, contemplación — mirar de lejos (suscriptores)
//   interrogacion-libreta  investigar, preguntar — lo que todavía no sabemos
//   exclamacion-foco       idea, atención — lo que destaca (rankings)
//
// Los PNG viven en public/marca/, copiados tal cual del sistema de diseño
// de Perpetuo. Tinta negra sobre transparente: solo sobre fondos claros.

import Image from "next/image";

export type PersonajeName = "punto-corriendo" | "punto-estrella" | "interrogacion-libreta" | "exclamacion-foco";

const SIZES: Record<PersonajeName, { width: number; height: number; alt: string }> = {
  "punto-corriendo": { width: 480, height: 440, alt: "Punto, el personaje de Perpetuo, corriendo" },
  "punto-estrella": { width: 480, height: 239, alt: "Punto, recostado, mirando una estrella" },
  "interrogacion-libreta": { width: 379, height: 480, alt: "Interrogación escribiendo en una libreta" },
  "exclamacion-foco": { width: 429, height: 480, alt: "Exclamación señalando un foco encendido" },
};

export function Personaje({
  name,
  height,
  className = "",
  decorative = true,
  priority = false,
}: {
  name: PersonajeName;
  // Alto en px; el ancho sale de la proporción del dibujo.
  height: number;
  className?: string;
  // Casi siempre acompaña a un texto que ya dice lo mismo: se oculta a los
  // lectores de pantalla para no repetir.
  decorative?: boolean;
  // Arriba del pliegue (encabezados): se carga de inmediato, sin lazy.
  priority?: boolean;
}) {
  const art = SIZES[name];
  const width = Math.round((art.width / art.height) * height);
  return (
    <Image
      src={`/marca/${name}.png`}
      width={width}
      height={height}
      alt={decorative ? "" : art.alt}
      aria-hidden={decorative || undefined}
      className={`personaje select-none ${className}`}
      draggable={false}
      priority={priority}
    />
  );
}

// Estado vacío con personaje: la interrogación, porque un recorte sin datos
// es una pregunta abierta, no un error.
export function EmptyState({
  children,
  personaje = "interrogacion-libreta",
  compact = false,
}: {
  children: React.ReactNode;
  personaje?: PersonajeName;
  compact?: boolean;
}) {
  return (
    <div className={`flex items-center gap-5 text-sm text-ink-secondary ${compact ? "py-4" : "py-8"}`}>
      <Personaje name={personaje} height={compact ? 56 : 88} className="shrink-0" />
      <div className="max-w-md">{children}</div>
    </div>
  );
}
