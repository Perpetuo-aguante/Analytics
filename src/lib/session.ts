import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

// Este módulo usa node:crypto, así que solo se puede importar desde código
// de servidor (server actions, Server Components) — nunca desde un
// componente cliente.

export const SESSION_COOKIE_NAME = "perpetuo_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 14; // 14 días
export const SESSION_MAX_AGE = SESSION_DURATION_SECONDS;

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("Falta la variable de entorno SESSION_SECRET.");
  return secret;
}

function sign(value: string): string {
  return createHmac("sha256", getSecret()).update(value).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// El valor de la cookie es "<expiracion>.<firma>". La firma evita que
// alguien fabrique una cookie válida sin conocer SESSION_SECRET.
export function createSessionCookieValue(): string {
  const expiresAt = String(Date.now() + SESSION_DURATION_SECONDS * 1000);
  return `${expiresAt}.${sign(expiresAt)}`;
}

export function isValidSessionCookieValue(value: string | undefined): boolean {
  if (!value) return false;
  const [expiresAt, signature] = value.split(".");
  if (!expiresAt || !signature) return false;
  if (!safeEqual(signature, sign(expiresAt))) return false;
  return Number(expiresAt) > Date.now();
}

export function checkPassword(password: string): boolean {
  const expected = process.env.UPLOAD_PASSWORD;
  if (!expected) throw new Error("Falta la variable de entorno UPLOAD_PASSWORD.");
  return safeEqual(password, expected);
}

// Lanza si no hay una sesión de admin válida. Usar al principio de toda
// server action que escriba datos (cargas, ediciones manuales, etc.).
export async function requireSession(): Promise<void> {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!isValidSessionCookieValue(session)) {
    throw new Error("Sesión expirada. Vuelve a iniciar sesión.");
  }
}
