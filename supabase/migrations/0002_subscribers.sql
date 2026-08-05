-- Perpetuo Analytics — sección de suscriptores.
-- Pega este archivo completo en Supabase → SQL Editor → Run (después de 0001).

-- ─────────────────────────────────────────────
-- TABLA subscribers: la identidad de cada suscriptor y sus atributos
-- descriptivos, que "pisan" en cada carga (mismo patrón que
-- posts.author/topic/post_type). El email es la clave natural estable.
-- ─────────────────────────────────────────────
create table subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text,
  type text,                         -- Free, Comp, Yearly Subscriber, Monthly Subscriber, Author, etc.
  stripe_plan text,
  start_date date,                   -- fecha de alta (base de la antigüedad)
  cancel_date date,
  paid_upgrade_date date,
  first_paid_date date,
  expiration_date date,
  subscription_source_free text,
  subscription_source_paid text,
  country text,
  state_province text,
  sections text[],                   -- preferencias: secciones a las que está suscripto
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_subscribers_type on subscribers (type);
create index idx_subscribers_country on subscribers (country);

-- ─────────────────────────────────────────────
-- TABLA subscriber_snapshots: las métricas cuantitativas de actividad de un
-- suscriptor en un momento dado. Cada carga agrega filas NUEVAS, nunca
-- sobrescribe históricos (mismo patrón que metric_snapshots).
-- ─────────────────────────────────────────────
create table subscriber_snapshots (
  id uuid primary key default gen_random_uuid(),
  subscriber_id uuid not null references subscribers(id) on delete cascade,
  snapshot_date date not null,
  revenue numeric(10,2),
  subscriptions_gifted integer,
  bestseller integer,
  emails_received_6mo integer,
  emails_dropped_6mo integer,
  emails_opened_6mo integer,
  emails_opened_7d integer,
  emails_opened_30d integer,
  num_emails_opened integer,
  last_email_open timestamptz,
  links_clicked integer,
  last_clicked_at timestamptz,
  unique_emails_seen_6mo integer,
  unique_emails_seen_7d integer,
  unique_emails_seen_30d integer,
  post_views integer,
  post_views_7d integer,
  post_views_30d integer,
  unique_posts_seen integer,
  unique_posts_seen_7d integer,
  unique_posts_seen_30d integer,
  comments integer,
  comments_7d integer,
  comments_30d integer,
  shares integer,
  shares_7d integer,
  shares_30d integer,
  days_active_30d integer,
  activity integer,                  -- score 0-5 de Substack
  created_at timestamptz not null default now(),
  unique (subscriber_id, snapshot_date)
);

create index idx_subscriber_snapshots_subscriber on subscriber_snapshots (subscriber_id);
create index idx_subscriber_snapshots_date on subscriber_snapshots (snapshot_date);

-- ─────────────────────────────────────────────
-- VISTA current_subscriber_metrics: el snapshot más reciente de cada
-- suscriptor + sus atributos, con dos tasas ya calculadas para no repetir
-- la división en cada query.
-- ─────────────────────────────────────────────
create view current_subscriber_metrics as
select distinct on (ss.subscriber_id)
  s.id as subscriber_id,
  s.email,
  s.name,
  s.type,
  s.stripe_plan,
  s.start_date,
  s.cancel_date,
  s.paid_upgrade_date,
  s.first_paid_date,
  s.expiration_date,
  s.subscription_source_free,
  s.subscription_source_paid,
  s.country,
  s.state_province,
  s.sections,
  ss.snapshot_date,
  ss.revenue,
  ss.subscriptions_gifted,
  ss.bestseller,
  ss.emails_received_6mo,
  ss.emails_dropped_6mo,
  ss.emails_opened_6mo,
  ss.emails_opened_7d,
  ss.emails_opened_30d,
  ss.num_emails_opened,
  ss.last_email_open,
  ss.links_clicked,
  ss.last_clicked_at,
  ss.unique_emails_seen_6mo,
  ss.unique_emails_seen_7d,
  ss.unique_emails_seen_30d,
  ss.post_views,
  ss.post_views_7d,
  ss.post_views_30d,
  ss.unique_posts_seen,
  ss.unique_posts_seen_7d,
  ss.unique_posts_seen_30d,
  ss.comments,
  ss.comments_7d,
  ss.comments_30d,
  ss.shares,
  ss.shares_7d,
  ss.shares_30d,
  ss.days_active_30d,
  ss.activity,
  case when ss.emails_received_6mo > 0
    then ss.emails_opened_6mo::numeric / ss.emails_received_6mo
    else null end as open_rate_6mo,
  case when ss.emails_opened_6mo > 0
    then ss.links_clicked::numeric / ss.emails_opened_6mo
    else null end as click_rate
from subscriber_snapshots ss
join subscribers s on s.id = ss.subscriber_id
order by ss.subscriber_id, ss.snapshot_date desc;

-- ─────────────────────────────────────────────
-- SEGURIDAD (RLS): mismo criterio que posts/metric_snapshots — lectura
-- pública, escritura solo desde el server con la service_role key.
-- ─────────────────────────────────────────────
alter table subscribers enable row level security;
alter table subscriber_snapshots enable row level security;

create policy "lectura pública de subscribers" on subscribers
  for select using (true);

create policy "lectura pública de subscriber_snapshots" on subscriber_snapshots
  for select using (true);
