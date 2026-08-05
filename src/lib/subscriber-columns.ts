// A diferencia de columns.ts (métricas de posts, que vienen de fuentes
// variadas y necesitan mapeo manual), este export lo genera siempre
// Substack con el mismo set de columnas fijas. Por eso acá no hay pantalla
// de mapeo: solo resolvemos cada campo interno contra el encabezado
// esperado, normalizando con la misma `normalizeHeader` de columns.ts. Si
// Substack cambia el nombre de una columna, ese campo queda sin poblar (no
// rompe el import) — basta con actualizar el string de abajo.

import { normalizeHeader } from "./columns";

export type SubscriberFieldKey =
  | "email"
  | "name"
  | "stripe_plan"
  | "cancel_date"
  | "start_date"
  | "paid_upgrade_date"
  | "bestseller"
  | "emails_received_6mo"
  | "emails_dropped_6mo"
  | "num_emails_opened"
  | "emails_opened_6mo"
  | "emails_opened_7d"
  | "emails_opened_30d"
  | "last_email_open"
  | "links_clicked"
  | "last_clicked_at"
  | "unique_emails_seen_6mo"
  | "unique_emails_seen_7d"
  | "unique_emails_seen_30d"
  | "post_views"
  | "post_views_7d"
  | "post_views_30d"
  | "unique_posts_seen"
  | "unique_posts_seen_7d"
  | "unique_posts_seen_30d"
  | "comments"
  | "comments_7d"
  | "comments_30d"
  | "shares"
  | "shares_7d"
  | "shares_30d"
  | "subscriptions_gifted"
  | "first_paid_date"
  | "revenue"
  | "subscription_source_free"
  | "subscription_source_paid"
  | "days_active_30d"
  | "activity"
  | "country"
  | "state_province"
  | "expiration_date"
  | "type"
  | "sections";

// Único campo sin el que no se puede identificar un suscriptor.
export const SUBSCRIBER_REQUIRED_FIELDS: SubscriberFieldKey[] = ["email"];

// El encabezado tal como lo trae hoy el export de Substack.
const EXPECTED_HEADERS: Record<SubscriberFieldKey, string> = {
  email: "Email",
  name: "Name",
  stripe_plan: "Stripe plan",
  cancel_date: "Cancel date",
  start_date: "Start date",
  paid_upgrade_date: "Paid upgrade date",
  bestseller: "Bestseller",
  emails_received_6mo: "Emails received (6mo)",
  emails_dropped_6mo: "Emails dropped (6mo)",
  num_emails_opened: "num_emails_opened",
  emails_opened_6mo: "Emails opened (6mo)",
  emails_opened_7d: "Emails opened (7d)",
  emails_opened_30d: "Emails opened (30d)",
  last_email_open: "Last email open",
  links_clicked: "Links clicked",
  last_clicked_at: "Last clicked at",
  unique_emails_seen_6mo: "Unique emails seen (6mo)",
  unique_emails_seen_7d: "Unique emails seen (7d)",
  unique_emails_seen_30d: "Unique emails seen (30d)",
  post_views: "Post views",
  post_views_7d: "Post views (7d)",
  post_views_30d: "Post views (30d)",
  unique_posts_seen: "Unique posts seen",
  unique_posts_seen_7d: "Unique posts seen (7d)",
  unique_posts_seen_30d: "Unique posts seen (30d)",
  comments: "Comments",
  comments_7d: "Comments (7d)",
  comments_30d: "Comments (30d)",
  shares: "Shares",
  shares_7d: "Shares (7d)",
  shares_30d: "Shares (30d)",
  subscriptions_gifted: "Subscriptions gifted",
  first_paid_date: "First paid date",
  revenue: "Revenue",
  subscription_source_free: "Subscription source (free)",
  subscription_source_paid: "Subscription source (paid)",
  days_active_30d: "Days active (30d)",
  activity: "Activity",
  country: "Country",
  state_province: "State/Province",
  expiration_date: "Expiration date",
  type: "Type",
  sections: "Sections",
};

export const SUBSCRIBER_FIELD_ORDER = Object.keys(EXPECTED_HEADERS) as SubscriberFieldKey[];

// Resuelve, para cada campo interno, cuál de los encabezados reales del
// archivo le corresponde (o null si no está presente). Se usa la clave
// devuelta para leer `row[header]` al importar.
export function resolveSubscriberColumns(headers: string[]): Record<SubscriberFieldKey, string | null> {
  const normalized = headers.map((raw) => ({ raw, norm: normalizeHeader(raw) }));
  const result = {} as Record<SubscriberFieldKey, string | null>;
  for (const field of SUBSCRIBER_FIELD_ORDER) {
    const expectedNorm = normalizeHeader(EXPECTED_HEADERS[field]);
    const match = normalized.find((h) => h.norm === expectedNorm);
    result[field] = match ? match.raw : null;
  }
  return result;
}

// "Sections" viene como "Perpetuo,El creativo,Los anteojos," (con coma y
// espacio final incluidos) — se listan las preferencias de newsletter del
// suscriptor.
export function parseSections(value: unknown): string[] {
  if (value == null) return [];
  return String(value)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
