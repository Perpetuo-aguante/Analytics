-- Perpetuo Analytics — esquema inicial
-- Pega este archivo completo en Supabase → SQL Editor → Run.

-- Necesario para generar IDs únicos (UUID) automáticamente.
create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────
-- TABLA posts: la identidad de cada post.
-- No cambia semana a semana — es el post en sí,
-- no sus métricas.
-- ─────────────────────────────────────────────
create table posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,        -- clave natural estable, derivada del título
  url text,                         -- opcional: no todos los exports de Substack la traen
  title text not null,
  author text,                      -- autor o subtítulo del post
  published_at date,
  topic text,                       -- "tema" (histórico; ya no se pide al cargar)
  post_type text,                   -- "tipo de post"
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- TABLA metric_snapshots: una foto de las métricas
-- de un post en un momento dado. Cada carga semanal
-- agrega filas NUEVAS, nunca sobrescribe históricos.
-- ─────────────────────────────────────────────
create table metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  snapshot_date date not null,      -- fecha de la carga (ej. el lunes que subes el archivo)
  views integer,
  new_subscribers integer,
  open_rate numeric(6,4),           -- guardado como fracción: 0.4523 = 45.23%
  click_to_open_rate numeric(6,4),
  engagement numeric(6,4),
  created_at timestamptz not null default now(),
  unique (post_id, snapshot_date)   -- evita duplicar el snapshot de la misma semana
);

create index idx_snapshots_post on metric_snapshots (post_id);
create index idx_snapshots_date on metric_snapshots (snapshot_date);

-- ─────────────────────────────────────────────
-- VISTA current_metrics: el snapshot más reciente
-- de cada post — es lo que alimenta el sitio público
-- (leaderboards, búsqueda, etc.)
-- ─────────────────────────────────────────────
create view current_metrics as
select distinct on (ms.post_id)
  p.id as post_id,
  p.slug,
  p.url,
  p.title,
  p.author,
  p.published_at,
  p.topic,
  p.post_type,
  ms.snapshot_date,
  ms.views,
  ms.new_subscribers,
  ms.open_rate,
  ms.click_to_open_rate,
  ms.engagement
from metric_snapshots ms
join posts p on p.id = ms.post_id
order by ms.post_id, ms.snapshot_date desc;

-- ─────────────────────────────────────────────
-- SEGURIDAD (RLS): el sitio público solo puede LEER.
-- Las cargas (insert/update) las hace el servidor de
-- Next.js con la service_role key, que nunca se expone
-- al navegador y por lo tanto no está sujeta a RLS.
-- ─────────────────────────────────────────────
alter table posts enable row level security;
alter table metric_snapshots enable row level security;

create policy "lectura pública de posts" on posts
  for select using (true);

create policy "lectura pública de snapshots" on metric_snapshots
  for select using (true);

-- No se crean políticas de insert/update/delete para el rol "anon":
-- aunque alguien tenga la anon key (es pública, vive en el navegador),
-- no puede escribir nada.
