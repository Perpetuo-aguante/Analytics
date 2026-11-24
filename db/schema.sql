-- Perpetuo Analytics — esquema completo en Postgres (Neon).
--
-- Es el estado final de lo que antes eran supabase/schema.sql más las
-- migraciones 0001 a 0007, consolidado en un solo archivo. Se puede correr
-- las veces que haga falta (todo es "if not exists" / "or replace"):
--
--   npm run db:migrate
--
-- Corre contra DATABASE_URL_UNPOOLED (la conexión directa, la que Neon
-- recomienda para cambios de esquema). Cada sentencia termina en ";" al
-- final de una línea: así la separa scripts/migrate.mjs.
--
-- Diferencias con la versión de Supabase:
-- - Sin políticas RLS de "lectura pública": la base ya no se expone con una
--   API pública (no hay anon key); solo el servidor de Next.js la consulta.
-- - Sin la extensión pgcrypto: gen_random_uuid() es nativa desde Postgres 13.
-- - Sin los backfills de datos de 0004 (post_type por día de la semana) y
--   0007 (Universidad del Meta → Colombia): sobre una base nueva no hay nada
--   que corregir, y la app ya hace las dos cosas sola en cada carga.

-- ─────────────────────────────────────────────
-- posts: la identidad de cada post (no cambia semana a semana).
-- ─────────────────────────────────────────────
create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,               -- clave natural estable, derivada del título
  url text,                                -- opcional: no todos los exports de Substack la traen
  title text not null,
  author text,                             -- autor o subtítulo del post
  published_at date,
  topic text,                              -- "tema" (histórico; ya no se pide al cargar)
  post_type text,                          -- categoría principal
  extra_post_types text[] not null default '{}', -- categorías adicionales (se asignan a mano)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- metric_snapshots: una foto de las métricas de un post por carga semanal.
-- ─────────────────────────────────────────────
create table if not exists metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  snapshot_date date not null,
  views integer,
  new_subscribers integer,
  open_rate numeric(6,4),                  -- fracción: 0.4523 = 45.23%
  click_to_open_rate numeric(6,4),
  engagement numeric(6,4),
  estimated_value numeric(12,2),           -- "Estimated value" de Substack, en USD
  created_at timestamptz not null default now(),
  unique (post_id, snapshot_date)
);

create index if not exists idx_snapshots_post on metric_snapshots (post_id);
create index if not exists idx_snapshots_date on metric_snapshots (snapshot_date);

-- ─────────────────────────────────────────────
-- current_metrics: el snapshot más reciente de cada post.
-- ─────────────────────────────────────────────
create or replace view current_metrics as
select distinct on (ms.post_id)
  p.id as post_id,
  p.slug,
  p.url,
  p.title,
  p.author,
  p.published_at,
  p.topic,
  p.post_type,
  p.extra_post_types,
  ms.snapshot_date,
  ms.views,
  ms.new_subscribers,
  ms.open_rate,
  ms.click_to_open_rate,
  ms.engagement,
  ms.estimated_value
from metric_snapshots ms
join posts p on p.id = ms.post_id
order by ms.post_id, ms.snapshot_date desc;

-- ─────────────────────────────────────────────
-- post_categories: las secciones, editables desde /subir.
-- ─────────────────────────────────────────────
create table if not exists post_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  color text not null,
  shape text not null default 'circle',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_post_categories_sort on post_categories (sort_order);

insert into post_categories (name, slug, color, shape, sort_order) values
  ('Estelar', 'estelar', '#0f52a0', 'circle', 1),
  ('Anteojos Editorial', 'anteojos-editorial', '#d0301f', 'star', 2),
  ('El Creativo', 'el-creativo', '#1baf7a', 'cross', 3),
  ('Ensayo', 'ensayo', '#eda100', 'square', 4),
  ('Cuento', 'cuento', '#8a4fd0', 'triangle', 5),
  ('Poema', 'poema', '#008300', 'diamond', 6),
  ('Foto-Ensayo', 'foto-ensayo', '#e87ba4', 'ring', 7),
  -- Secciones nuevas (nov. 2026), sin día fijo de publicación. Colores
  -- validados con el validador de la skill dataviz sobre la superficie de la
  -- app, en este orden de pares adyacentes: el naranja (la única familia de
  -- la paleta que faltaba) solo pasa en el primer lugar; Reseña comparte el
  -- violeta de Cuento (no hay una novena familia de color) y se distingue
  -- por la forma (anillo).
  ('Sobremesa', 'sobremesa', '#eb6834', 'circle', 0),
  ('Reseña', 'resena', '#8a4fd0', 'ring', 8)
on conflict (name) do nothing;

-- ─────────────────────────────────────────────
-- subscribers: identidad (email) + atributos que se pisan en cada carga.
-- ─────────────────────────────────────────────
create table if not exists subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text,
  type text,                               -- Free, Comp, Yearly Subscriber, etc.
  stripe_plan text,
  start_date date,                         -- fecha de alta (base de la antigüedad)
  cancel_date date,
  paid_upgrade_date date,
  first_paid_date date,
  expiration_date date,
  subscription_source_free text,
  subscription_source_paid text,
  country text,
  state_province text,
  sections text[],                         -- secciones a las que está suscripto
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_subscribers_type on subscribers (type);
create index if not exists idx_subscribers_country on subscribers (country);

-- ─────────────────────────────────────────────
-- subscriber_snapshots: métricas de actividad de un suscriptor por carga.
-- ─────────────────────────────────────────────
create table if not exists subscriber_snapshots (
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
  activity integer,                        -- score 0-5 de Substack
  created_at timestamptz not null default now(),
  unique (subscriber_id, snapshot_date)
);

create index if not exists idx_subscriber_snapshots_subscriber on subscriber_snapshots (subscriber_id);
create index if not exists idx_subscriber_snapshots_date on subscriber_snapshots (snapshot_date);

-- ─────────────────────────────────────────────
-- current_subscriber_metrics: snapshot más reciente de cada suscriptor, con
-- open rate (sobre correos únicos vistos, tope 100%) y click rate.
-- ─────────────────────────────────────────────
create or replace view current_subscriber_metrics as
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
    then least(ss.unique_emails_seen_6mo::numeric / ss.emails_received_6mo, 1)
    else null end as open_rate_6mo,
  case when ss.emails_opened_6mo > 0
    then least(ss.links_clicked::numeric / ss.emails_opened_6mo, 1)
    else null end as click_rate
from subscriber_snapshots ss
join subscribers s on s.id = ss.subscriber_id
order by ss.subscriber_id, ss.snapshot_date desc;

-- ─────────────────────────────────────────────
-- ingest_runs: registro de cada carga que llega por la API de ingesta
-- (app/api/ingest/*), exitosa o no. Sirve para ver en /subir si el agente
-- automático corrió y si falló.
-- ─────────────────────────────────────────────
create table if not exists ingest_runs (
  id uuid primary key default gen_random_uuid(),
  kind text not null,                      -- 'posts' | 'subscribers'
  snapshot_date date,
  ok boolean not null,
  dry_run boolean not null default false,
  row_count integer,
  summary jsonb,                           -- el resumen de la importación
  error text,
  source text,                             -- User-Agent de quien subió
  created_at timestamptz not null default now()
);

create index if not exists idx_ingest_runs_created on ingest_runs (created_at desc);
