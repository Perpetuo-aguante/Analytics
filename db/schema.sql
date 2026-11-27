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
  kind text not null,                      -- 'posts' | 'subscribers' | 'texts'
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

-- ─────────────────────────────────────────────
-- post_texts: el texto completo de cada post (el .txt que sube el agente por
-- POST /api/ingest/texts). Uno por post: una carga nueva lo reemplaza.
-- term_counts es la "huella léxica" del texto (las palabras con contenido y
-- cuántas veces aparecen, ver lib/text-analysis.ts): se calcula al guardar
-- para que el mapa de textos y la búsqueda de parecidos no tengan que leer
-- los textos enteros en cada página.
-- ─────────────────────────────────────────────
create table if not exists post_texts (
  post_id uuid primary key references posts(id) on delete cascade,
  body text not null,
  word_count integer not null,
  char_count integer not null,
  content_hash text not null,              -- sha256 del texto normalizado
  term_counts jsonb not null default '{}', -- {"palabra": veces}, solo palabras con contenido
  file_name text,                          -- nombre del .txt original, si vino como archivo
  source text,                             -- User-Agent de quien subió
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- Estilometría mínima de cada texto (rasgos baratos, sin modelos), en
-- post_texts.features. La calcula la app al guardar el texto
-- (lib/text-features.ts) y sirve para anclar el compass: avisa cuando el
-- score del LLM contradice los números.
-- ─────────────────────────────────────────────
alter table post_texts add column if not exists features jsonb not null default '{}';

-- ═════════════════════════════════════════════
-- Compass editorial (spec «Compass editorial y análisis literario de posts»,
-- versión lean). La lectura la hace el agente al subir cada texto
-- (POST /api/ingest/texts, campo `analisis`) siguiendo la guía de
-- GET /api/ingest/texts/guia; la app valida vocabularios y que cada cita
-- exista literalmente en el texto. Los vocabularios de los `check` salen
-- de src/lib/compass-vocab.ts.
-- ═════════════════════════════════════════════

-- Taxonomía fija de temas (PROVISIONAL). Lo político vive aquí, no en los ejes.
create table if not exists theme_taxonomy (
  slug text primary key,
  nombre text not null unique,
  descripcion text,
  sort_order integer not null default 0
);

insert into theme_taxonomy (slug, nombre, descripcion, sort_order) values
  ('politica-poder', 'Política y poder', 'gobierno, Estado, elecciones, partidos, poder público', 0),
  ('violencia', 'Violencia', 'crimen, narco, guerra, desaparición, violencia de Estado o doméstica', 1),
  ('justicia-derechos', 'Justicia y derechos', 'derechos humanos, leyes, impunidad, activismo', 2),
  ('migracion-frontera', 'Migración y frontera', 'migrar, exilio, frontera, diáspora', 3),
  ('ciudad-territorio', 'Ciudad y territorio', 'la ciudad, el barrio, el paisaje, el lugar', 4),
  ('memoria-historia', 'Memoria e historia', 'pasado colectivo, archivo, historia nacional', 5),
  ('familia', 'Familia', 'padres, hijos, herencia, crianza, linaje', 6),
  ('amor-deseo', 'Amor y deseo', 'pareja, erotismo, enamoramiento, ruptura', 7),
  ('duelo-muerte', 'Duelo y muerte', 'pérdida, muerte, luto', 8),
  ('cuerpo-salud', 'Cuerpo y salud', 'cuerpo, enfermedad, salud mental, envejecimiento', 9),
  ('identidad-genero', 'Identidad y género', 'género, sexualidad, raza, clase como identidad', 10),
  ('infancia', 'Infancia', 'niñez, adolescencia, formación', 11),
  ('trabajo-economia', 'Trabajo y economía', 'dinero, empleo, precariedad, consumo', 12),
  ('tecnologia', 'Tecnología', 'internet, redes, inteligencia artificial, ciencia aplicada', 13),
  ('naturaleza-ambiente', 'Naturaleza y ambiente', 'animales, ecología, crisis climática', 14),
  ('fe-espiritualidad', 'Fe y espiritualidad', 'religión, lo sagrado, ritual, mística', 15),
  ('literatura-escritura', 'Literatura y escritura', 'leer, escribir, libros, el oficio, la lengua', 16),
  ('arte-cultura', 'Arte y cultura', 'artes visuales, cine, música, teatro, cultura popular', 17),
  ('filosofia-ideas', 'Filosofía e ideas', 'pensamiento, ética, conceptos, teoría', 18),
  ('viaje', 'Viaje', 'viajar, desplazamiento, extranjería', 19),
  ('comida', 'Comida', 'cocina, alimentación, sobremesa', 20),
  ('deporte-juego', 'Deporte y juego', 'deporte, futbol, juego, competencia', 21)
on conflict (slug) do update set nombre = excluded.nombre, descripcion = excluded.descripcion, sort_order = excluded.sort_order;

create table if not exists post_compass (
  post_id uuid primary key references posts(id) on delete cascade,
  content_hash text not null,              -- de qué versión del texto es la lectura
  prompt_version text not null,
  modelo text,
  -- X: referencial (0) ↔ poético (100). Y: impersonal (0) ↔ subjetivo (100).
  compass_x integer not null check (compass_x between 0 and 100),
  compass_x_confianza numeric(4,3) not null,
  compass_y integer not null check (compass_y between 0 and 100),
  compass_y_confianza numeric(4,3) not null,
  tesis text check (tesis in ('explícita al inicio', 'explícita al final', 'implícita', 'ausente')),
  polo_dominante text check (polo_dominante in ('metafórico', 'metonímico', 'equilibrado')),
  dificultad integer check (dificultad between 1 and 5),
  tipo_gancho text check (tipo_gancho in ('escena in medias res', 'pregunta', 'tesis provocadora', 'anécdota', 'dato', 'cita', 'imagen', 'contexto expositivo')),
  fuerza_gancho integer check (fuerza_gancho between 1 and 5),
  cierre text check (cierre in ('abierto', 'cerrado', 'epifánico', 'remate irónico', 'circular', 'llamado a la acción')),
  -- La lectura completa: por dimensión, sus valores, evidencia, confianza,
  -- evidencia_invalida y cuántas veces se reintentó.
  dimensiones jsonb not null,
  campos_evidencia_invalida text[] not null default '{}',
  analyzed_at timestamptz not null default now()
);

create table if not exists post_themes (
  post_id uuid not null references posts(id) on delete cascade,
  tema text not null references theme_taxonomy(slug) on update cascade,
  peso numeric(4,3) not null check (peso between 0 and 1),
  primary key (post_id, tema)
);

create index if not exists idx_post_themes_tema on post_themes (tema);

create table if not exists post_references (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  autor text not null,
  obra text,
  tipo text not null check (tipo in ('cita', 'alusión', 'parodia', 'epígrafe')),
  tradicion text not null check (tradicion in ('latinoamericana', 'española', 'europea', 'anglo', 'clásica', 'otra')),
  evidencia text,
  evidencia_invalida boolean not null default false
);

create index if not exists idx_post_references_post on post_references (post_id);
