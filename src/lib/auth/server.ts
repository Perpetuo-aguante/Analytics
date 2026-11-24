import { createNeonAuth } from "@neon/auth/next/server";

// Neon Auth (Better Auth administrado por Neon): las cuentas y sesiones
// viven en el esquema neon_auth de la misma base. Solo se importa desde el
// servidor.
let instance: ReturnType<typeof createNeonAuth> | null = null;

export function getAuth(): ReturnType<typeof createNeonAuth> {
  if (instance) return instance;
  const baseUrl = process.env.NEON_AUTH_BASE_URL;
  const secret = process.env.NEON_AUTH_COOKIE_SECRET;
  if (!baseUrl) throw new Error("Falta la variable de entorno NEON_AUTH_BASE_URL.");
  if (!secret) throw new Error("Falta la variable de entorno NEON_AUTH_COOKIE_SECRET.");
  instance = createNeonAuth({ baseUrl, cookies: { secret } });
  return instance;
}
