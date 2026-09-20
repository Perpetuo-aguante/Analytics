-- Perpetuo Analytics — categorías de post editables.
-- Pega este archivo completo en Supabase → SQL Editor → Run (después de 0004).
--
-- Antes las categorías eran una lista fija en el código (lib/post-types.ts,
-- lib/post-type-style.ts). Ahora viven en esta tabla para que se puedan
-- crear y borrar categorías nuevas desde /subir sin tocar código ni
-- redeployar. Se siembra con las 7 categorías que ya existían, con el mismo
-- nombre/color/forma/slug que ya tenían, para que nada cambie de aspecto en
-- los charts existentes.

create table post_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  color text not null,
  shape text not null default 'circle',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index idx_post_categories_sort on post_categories (sort_order);

insert into post_categories (name, slug, color, shape, sort_order) values
  ('Estelar', 'estelar', '#0f52a0', 'circle', 1),
  ('Anteojos Editorial', 'anteojos-editorial', '#d0301f', 'star', 2),
  ('El Creativo', 'el-creativo', '#1baf7a', 'cross', 3),
  ('Ensayo', 'ensayo', '#eda100', 'square', 4),
  ('Cuento', 'cuento', '#8a4fd0', 'triangle', 5),
  ('Poema', 'poema', '#008300', 'diamond', 6),
  ('Foto-Ensayo', 'foto-ensayo', '#e87ba4', 'ring', 7);

alter table post_categories enable row level security;

create policy "lectura pública de categorías" on post_categories
  for select using (true);

-- Igual que posts/metric_snapshots: sin políticas de insert/update/delete
-- para "anon" — crear y borrar categorías lo hace el servidor de Next.js con
-- la service_role key (ver app/subir/category-actions.ts), que no está
-- sujeta a RLS.
