import { createClient } from "@supabase/supabase-js";

// Cliente de solo lectura, usa la anon key (segura de exponer: la RLS de
// Postgres solo le permite hacer SELECT). La usan las páginas públicas.
export function createAnonClient() {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    { auth: { persistSession: false } }
  );
}

// Cliente con permisos de escritura, usa la service_role key. Salta la RLS,
// así que solo debe usarse desde código de servidor ya protegido (server
// actions detrás de la contraseña de /subir), nunca en un componente cliente.
export function createAdminClient() {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } }
  );
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}.`);
  }
  return value;
}
