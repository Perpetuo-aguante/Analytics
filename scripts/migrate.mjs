// Aplica db/schema.sql a la base de Neon. Es idempotente: se puede correr
// cada vez que cambie el esquema.
//
//   npm run db:migrate
//
// Usa DATABASE_URL_UNPOOLED (conexión directa, la recomendada por Neon para
// cambios de esquema) y cae a DATABASE_URL si no existe. Las variables se
// leen de .env.local / .env (las escribe `neon deploy` o `neon env pull`).
import { readFileSync, existsSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL_UNPOOLED (o DATABASE_URL). Corre `neon env pull` primero.");
  process.exit(1);
}

const schema = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8");
const statements = schema
  .split(/;\s*$/m)
  .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
  .filter(Boolean);

const sql = neon(url);
// Todas las sentencias van en una sola transacción: o se aplica el esquema
// completo o no cambia nada.
await sql.transaction(statements.map((s) => sql.query(s)));
console.log(`Esquema aplicado: ${statements.length} sentencias.`);
