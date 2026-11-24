import { query } from "@/lib/db";

// Política de almacenamiento de subscriber_snapshots.
//
// Con cargas automáticas tres veces por semana, guardar todas las filas de
// todos los suscriptores son ~150.000 filas por semana con 50.000
// suscriptores: el plan gratis de Neon (1 GB) se llenaría en menos de un año.
// Pero el histórico fino solo aporta en los primeros meses de cada
// suscriptor (retención y engagement a 1 y 3 meses, ver
// lib/retention-queries.ts). Por eso, de cada suscriptor se conservan:
//
// 1. Todas sus cargas de los primeros EARLY_WINDOW_DAYS días desde su alta
//    (cubren los cortes de 30 y 90 días con margen).
// 2. Su carga más reciente (la que alimenta los paneles).
// 3. La primera carga de cada mes calendario (evolución mensual a largo plazo).
//
// El resto se borra. Las métricas de posts no pasan por esto: son pocas
// filas y su detalle fino es justamente lo que muestra los picos de interés.
export const EARLY_WINDOW_DAYS = 100;

export async function pruneSubscriberSnapshots(): Promise<number> {
  const [result] = await query<{ deleted: number }>(
    `with ranked as (
       select ss.id,
              ss.snapshot_date,
              s.start_date,
              max(ss.snapshot_date) over (partition by ss.subscriber_id) as latest,
              min(ss.snapshot_date) over (
                partition by ss.subscriber_id, date_trunc('month', ss.snapshot_date)
              ) as first_of_month
       from subscriber_snapshots ss
       join subscribers s on s.id = ss.subscriber_id
     ), removed as (
       delete from subscriber_snapshots
       where id in (
         select id from ranked
         where snapshot_date <> latest
           and snapshot_date <> first_of_month
           and (start_date is null or snapshot_date > start_date + $1::int)
       )
       returning 1
     )
     select count(*)::int as deleted from removed`,
    [EARLY_WINDOW_DAYS]
  );
  return result?.deleted ?? 0;
}
