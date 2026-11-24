"use client";

// Página de error de toda la app. Sin ella, Next muestra en producción su
// pantalla genérica, que se lee como "404 — This page could not be found"
// aunque el problema sea otro (por ejemplo, que falten las variables de Neon
// en Vercel). En producción el mensaje real del error no llega al navegador
// (solo un código), así que se muestra qué revisar y un enlace al chequeo
// /api/health, que dice qué variables faltan.

import { useEffect } from "react";

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-6 py-16">
      <h1 className="font-display text-2xl font-semibold">No se pudo cargar esta página</h1>
      <p className="mt-3 text-sm text-ink-secondary">
        Falló algo en el servidor. Si el sitio se acaba de configurar o mudar, lo más probable es que falte alguna
        variable de entorno en Vercel (o que se haya agregado sin volver a desplegar).
      </p>
      <p className="mt-3 text-sm text-ink-secondary">
        <a href="/api/health" className="font-medium text-blue underline underline-offset-2">
          Ver el chequeo de configuración
        </a>{" "}
        para saber qué falta.
      </p>
      {error.digest && <p className="mt-3 text-xs text-ink-muted">Código del error: {error.digest}</p>}
      <button type="button" onClick={() => unstable_retry()} className="btn-primary mt-6 text-sm">
        Reintentar
      </button>
    </main>
  );
}
