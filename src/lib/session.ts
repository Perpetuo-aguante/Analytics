import { connection } from "next/server";
import { getAuth } from "./auth/server";

// Quién puede cargar y corregir datos. Antes era una contraseña compartida
// (UPLOAD_PASSWORD); ahora cada persona entra con su cuenta de Neon Auth, y
// solo los correos de ADMIN_EMAILS (separados por coma) tienen permiso. Una
// cuenta puede crearla cualquiera desde /subir, pero sin estar en la lista no
// puede hacer nada. Si ADMIN_EMAILS no está configurada, nadie es admin
// (falla cerrado).
//
// Solo se importa desde el servidor (Server Components y Server Actions).

function adminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

export type SessionStatus =
  | { state: "signed-out" }
  | { state: "not-allowed"; email: string }
  | { state: "admin"; email: string };

export async function getSessionStatus(): Promise<SessionStatus> {
  // La sesión depende de las cookies de cada request: esto le dice a Next
  // que la página que la consulta no se puede prerenderizar en el build.
  await connection();
  const { data } = await getAuth().getSession();
  const email = data?.user?.email?.toLowerCase();
  if (!email) return { state: "signed-out" };
  return adminEmails().has(email) ? { state: "admin", email } : { state: "not-allowed", email };
}

export async function isAdmin(): Promise<boolean> {
  return (await getSessionStatus()).state === "admin";
}

// Lanza si no hay una sesión de admin válida. Usar al principio de toda
// server action que escriba datos (cargas, ediciones manuales, etc.).
export async function requireSession(): Promise<void> {
  const status = await getSessionStatus();
  if (status.state === "signed-out") throw new Error("Sesión expirada. Vuelve a iniciar sesión.");
  if (status.state === "not-allowed") throw new Error("Tu cuenta no tiene permiso para modificar datos.");
}
