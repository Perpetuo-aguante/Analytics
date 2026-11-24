import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";

// GET /api/health — chequeo de configuración para diagnosticar un deploy.
// Dice qué variables de entorno faltan (solo los nombres, nunca los valores)
// y si la base responde. No devuelve ningún dato de la base.
export const dynamic = "force-dynamic";

const REQUIRED = ["DATABASE_URL", "NEON_AUTH_BASE_URL", "NEON_AUTH_COOKIE_SECRET", "ADMIN_EMAILS"] as const;
const OPTIONAL = ["ANALYTICS_API_KEY", "INGEST_API_KEY"] as const;

export async function GET() {
  const missing = REQUIRED.filter((name) => !process.env[name]);
  const missingOptional = OPTIONAL.filter((name) => !process.env[name]);
  const cookieSecret = process.env.NEON_AUTH_COOKIE_SECRET;
  const problems: string[] = [];
  if (cookieSecret && cookieSecret.length < 32) problems.push("NEON_AUTH_COOKIE_SECRET debe tener al menos 32 caracteres.");

  let database: "ok" | "sin configurar" | "error" | "sin esquema" = "sin configurar";
  if (process.env.DATABASE_URL) {
    try {
      const row = await queryOne<{ ready: boolean }>("select to_regclass('public.posts') is not null as ready");
      database = row?.ready ? "ok" : "sin esquema";
      if (!row?.ready) problems.push("La base responde pero no tiene las tablas: corre `npm run db:migrate`.");
    } catch {
      database = "error";
      problems.push("DATABASE_URL está pero la base no responde (¿URL equivocada o de otro proyecto?).");
    }
  }

  const ok = missing.length === 0 && problems.length === 0 && database === "ok";
  return NextResponse.json(
    {
      ok,
      faltan: missing,
      opcionalesQueFaltan: missingOptional,
      baseDeDatos: database,
      problemas: problems,
      nota: "Después de agregar o cambiar variables en Vercel, hay que volver a desplegar para que se apliquen.",
    },
    { status: ok ? 200 : 503 }
  );
}
