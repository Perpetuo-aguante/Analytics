-- Migración incremental: pega este archivo en Supabase → SQL Editor → Run.
--
-- Motivo: algunos suscriptores mostraban open rate por encima de 100%.
-- current_subscriber_metrics calculaba open_rate_6mo como
-- emails_opened_6mo / emails_received_6mo, pero "Emails opened (6mo)" en el
-- export de Substack cuenta EVENTOS de apertura (si alguien reabre el mismo
-- correo, o el cliente de mail dispara el pixel de tracking más de una vez —
-- común con Apple Mail Privacy Protection—, ese correo suma más de un
-- "open"), no correos distintos abiertos. Eso permite que el numerador supere
-- al denominador. "Unique emails seen (6mo)" sí cuenta cada correo una sola
-- vez, que es la definición correcta de open rate. Se agrega además un
-- LEAST(...,1) como resguardo por si algún dato igual queda inconsistente.
--
-- click_rate no se reportó con el mismo problema, pero se le agrega el mismo
-- resguardo LEAST(...,1) por si acaso, sin cambiar su fórmula.

drop view if exists current_subscriber_metrics;

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
    then least(ss.unique_emails_seen_6mo::numeric / ss.emails_received_6mo, 1)
    else null end as open_rate_6mo,
  case when ss.emails_opened_6mo > 0
    then least(ss.links_clicked::numeric / ss.emails_opened_6mo, 1)
    else null end as click_rate
from subscriber_snapshots ss
join subscribers s on s.id = ss.subscriber_id
order by ss.subscriber_id, ss.snapshot_date desc;
