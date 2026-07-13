-- Migración incremental: si ya corriste supabase/schema.sql antes, pega este
-- archivo en Supabase → SQL Editor → Run para ponerte al día.
--
-- Motivo: los exports de Substack que usamos no traen URL, y el título real
-- viene en la columna "post_id" del CSV; "title" es en realidad el subtítulo
-- o el nombre del autor. Ver AGENTS.md / la pantalla de /subir.

alter table posts alter column url drop not null;
alter table posts add column if not exists author text;

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
  ms.snapshot_date,
  ms.views,
  ms.new_subscribers,
  ms.open_rate,
  ms.click_to_open_rate,
  ms.engagement
from metric_snapshots ms
join posts p on p.id = ms.post_id
order by ms.post_id, ms.snapshot_date desc;
