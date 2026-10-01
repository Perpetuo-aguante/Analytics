-- Perpetuo Analytics — posts con más de una categoría + ingresos estimados.
-- Pega este archivo completo en Supabase → SQL Editor → Run (después de 0005).
--
-- 1) Categorías múltiples. Hasta ahora cada post tenía UNA sola categoría
--    (posts.post_type), así que un Ensayo o un Poema que también es parte de
--    El Creativo solo sumaba a una de las dos secciones y el "jale" de cada
--    sección quedaba mal. post_type se queda como la categoría principal (la
--    que viene del CSV o se infiere por día de la semana, y la que da el
--    color en los charts) y se agrega extra_post_types: categorías
--    adicionales que se asignan a mano desde "Corregir datos" en
--    /post/[slug]. Va en una columna aparte a propósito: cada carga semanal
--    vuelve a escribir post_type, pero nunca toca extra_post_types, así que
--    las etiquetas extra no se pierden al re-subir un export.
--
-- 2) Ingresos estimados. El export de posts de Substack trae "Estimated
--    value" (en dólares) por post y no lo estábamos guardando. Se agrega a
--    metric_snapshots como cualquier otra métrica (una foto por carga).

alter table posts
  add column if not exists extra_post_types text[] not null default '{}';

alter table metric_snapshots
  add column if not exists estimated_value numeric(12,2);

drop view if exists current_metrics;
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
