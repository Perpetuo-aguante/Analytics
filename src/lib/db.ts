import { neon, types as pgTypes } from "@neondatabase/serverless";

// Acceso a Postgres (Neon). Toda la app habla con la base a través de este
// módulo, y solo desde el servidor (Server Components, Server Actions y Route
// Handlers): la base ya no tiene una API pública como la de Supabase, así que
// nada fuera de este servidor puede leerla.
//
// Driver: @neondatabase/serverless en modo HTTP. Cada consulta es un fetch
// HTTPS independiente, sin conexiones abiertas que administrar entre
// requests, lo que encaja con funciones serverless (Vercel). Ninguna consulta
// de la app necesita una transacción interactiva.

// Supabase (PostgREST) devolvía numeric y bigint como números, y date y
// timestamptz como texto ISO. El protocolo de Postgres los entrega como
// texto y, por defecto, el driver convierte date/timestamp a objetos Date y
// deja numeric/bigint como string. El resto del código (sumas, promedios,
// `dateStr.slice(0, 7)`, comparaciones de fechas como texto) depende del
// formato viejo, así que acá se reproduce exactamente.
const OID = { INT8: 20, NUMERIC: 1700, DATE: 1082, TIMESTAMP: 1114, TIMESTAMPTZ: 1184 } as const;

function toNumber(value: string): number {
  return Number(value);
}

// "2026-11-24 20:57:15.528+00" → "2026-11-24T20:57:15.528+00:00", el mismo
// formato que devolvía PostgREST.
function toIsoTimestamp(value: string): string {
  const iso = value.replace(" ", "T");
  return iso.replace(/([+-]\d{2})$/, "$1:00");
}

const customTypes = {
  getTypeParser(id: number, format?: "text" | "binary") {
    switch (id) {
      case OID.INT8:
      case OID.NUMERIC:
        return toNumber;
      case OID.DATE:
        return (value: string) => value;
      case OID.TIMESTAMP:
      case OID.TIMESTAMPTZ:
        return toIsoTimestamp;
      default:
        return pgTypes.getTypeParser(id, format);
    }
  },
};

type Sql = ReturnType<typeof neon<false, false>>;

let client: Sql | null = null;

function getClient(): Sql {
  if (client) return client;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta la variable de entorno DATABASE_URL.");
  client = neon(url);
  return client;
}

// Consulta parametrizada: los valores siempre van en `params` ($1, $2, …),
// nunca concatenados en el texto.
export async function query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  // Los parsers van en cada consulta: el driver ignora `types` si se pasa al
  // crear el cliente con neon(url, { types }).
  return (await getClient().query(text, params, { types: customTypes })) as T[];
}

export async function queryOne<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

// Varias consultas en una sola transacción: o se aplican todas o ninguna.
// Devuelve las filas de cada consulta, en el mismo orden.
export async function transaction(statements: { text: string; params?: unknown[] }[]): Promise<Record<string, unknown>[][]> {
  const sql = getClient();
  return (await sql.transaction(
    statements.map((s) => sql.query(s.text, s.params ?? [], { types: customTypes })),
    { types: customTypes }
  )) as Record<
    string,
    unknown
  >[][];
}

// Los nombres de tabla y columna no pueden ir como parámetros, así que solo
// se aceptan identificadores simples escritos en el propio código (nunca
// valores que vengan de un archivo subido o de la URL).
function ident(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`Identificador SQL inválido: ${name}`);
  return `"${name}"`;
}

// Inserta o actualiza muchas filas en una sola consulta (el equivalente al
// `.upsert(rows, { onConflict })` de Supabase). Las filas viajan como un
// único parámetro JSON y Postgres las convierte al tipo de cada columna con
// json_populate_recordset. Ante un conflicto solo se pisan las columnas que
// trae el payload: una columna que no viene (por ejemplo
// posts.extra_post_types en las cargas semanales) se conserva.
export async function upsertRows<T = Record<string, unknown>>(
  table: string,
  rows: Record<string, unknown>[],
  conflictColumns: string[],
  returning: string[] = []
): Promise<T[]> {
  if (rows.length === 0) return [];
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const cols = columns.map(ident).join(", ");
  const updatable = columns.filter((c) => !conflictColumns.includes(c));
  const onConflict =
    updatable.length > 0
      ? `do update set ${updatable.map((c) => `${ident(c)} = excluded.${ident(c)}`).join(", ")}`
      : "do nothing";
  const returningClause = returning.length > 0 ? ` returning ${returning.map(ident).join(", ")}` : "";

  const text =
    `insert into ${ident(table)} (${cols}) ` +
    `select ${cols} from json_populate_recordset(null::${ident(table)}, $1::json) ` +
    `on conflict (${conflictColumns.map(ident).join(", ")}) ${onConflict}${returningClause}`;
  return query<T>(text, [JSON.stringify(rows)]);
}
