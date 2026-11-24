import { query } from "./db";

// Retención y comportamiento temprano de los suscriptores (/suscriptores/retencion).
//
// Dos fuentes, con alcances distintos:
//
// 1. Retención y conversión a pago a 30 y 90 días: salen de las fechas de
//    cada suscriptor (alta, baja, primer pago), así que funcionan para TODO
//    el histórico desde la primera carga. Límite: solo cuenta a quien sigue
//    en el export de Substack (los cancelados están con su fecha de baja;
//    los borrados de la lista, no).
//
// 2. Engagement temprano (correos abiertos, posts leídos y días activos en
//    el primer mes y en el tercero): sale de las cargas automáticas. Hace
//    falta un snapshot tomado cerca del día 30 (o 90) de cada suscriptor,
//    porque el export de Substack solo trae ventanas "últimos 30 días". Con
//    cargas tres veces por semana casi todos los suscriptores nuevos tienen
//    uno; los que se dieron de alta antes de las cargas automáticas, no. La
//    política de almacenamiento (lib/imports/retention-policy.ts) conserva
//    justamente esas cargas de los primeros 100 días.

export type CohortRow = {
  month: string; // "YYYY-MM"
  signups: number;
  eligible30: number; // altas con al menos 30 días cumplidos
  retained30: number;
  paid30: number;
  eligible90: number;
  retained90: number;
  paid90: number;
};

export type EarlyEngagementRow = {
  day: 30 | 90; // corte: el snapshot más cercano al día 30 o al 90 desde el alta
  outcome: "retained" | "churned" | "pending"; // ¿seguía suscripto a los 90 días?
  subscribers: number;
  avgEmailsOpened: number | null; // correos distintos abiertos en los 30 días previos al corte
  avgPostViews: number | null;
  avgDaysActive: number | null;
};

export type RetentionData = {
  cohorts: CohortRow[];
  early: EarlyEngagementRow[];
  totals: {
    eligible30: number;
    retained30: number;
    paid30: number;
    eligible90: number;
    retained90: number;
    paid90: number;
  };
};

// Cuántos meses de altas entran en los totales de arriba (los stat tiles):
// el último año, para que reflejen la retención de hoy y no la de 2021.
const TOTALS_WINDOW_MONTHS = 12;

export async function getRetentionData(): Promise<RetentionData> {
  const [cohorts, early] = await Promise.all([
    query<CohortRow>(
      `select to_char(date_trunc('month', start_date), 'YYYY-MM') as month,
              count(*)::int as signups,
              count(*) filter (where start_date + 30 <= current_date)::int as eligible30,
              count(*) filter (
                where start_date + 30 <= current_date and (cancel_date is null or cancel_date > start_date + 30)
              )::int as retained30,
              count(*) filter (
                where start_date + 30 <= current_date
                  and coalesce(paid_upgrade_date, first_paid_date) <= start_date + 30
              )::int as paid30,
              count(*) filter (where start_date + 90 <= current_date)::int as eligible90,
              count(*) filter (
                where start_date + 90 <= current_date and (cancel_date is null or cancel_date > start_date + 90)
              )::int as retained90,
              count(*) filter (
                where start_date + 90 <= current_date
                  and coalesce(paid_upgrade_date, first_paid_date) <= start_date + 90
              )::int as paid90
       from subscribers
       where start_date is not null and start_date <= current_date
       group by 1
       order by 1`
    ),
    query<EarlyEngagementRow>(
      `with cuts(day, lo, hi) as (values (30, 25, 45), (90, 85, 100)),
       picked as (
         select distinct on (s.id, c.day)
                c.day, s.start_date, s.cancel_date,
                ss.unique_emails_seen_30d, ss.post_views_30d, ss.days_active_30d
         from subscribers s
         join subscriber_snapshots ss on ss.subscriber_id = s.id
         join cuts c on ss.snapshot_date between s.start_date + c.lo and s.start_date + c.hi
         where s.start_date is not null
         order by s.id, c.day, abs((ss.snapshot_date - s.start_date) - c.day)
       )
       select day,
              case
                when start_date + 90 > current_date and (cancel_date is null or cancel_date > current_date) then 'pending'
                when cancel_date is null or cancel_date > start_date + 90 then 'retained'
                else 'churned'
              end as outcome,
              count(*)::int as subscribers,
              avg(unique_emails_seen_30d)::float8 as "avgEmailsOpened",
              avg(post_views_30d)::float8 as "avgPostViews",
              avg(days_active_30d)::float8 as "avgDaysActive"
       from picked
       group by 1, 2
       order by 1, 2`
    ),
  ]);

  const recent = cohorts.slice(-TOTALS_WINDOW_MONTHS);
  const sum = (key: keyof Omit<CohortRow, "month">) => recent.reduce((acc, row) => acc + row[key], 0);

  return {
    cohorts,
    early,
    totals: {
      eligible30: sum("eligible30"),
      retained30: sum("retained30"),
      paid30: sum("paid30"),
      eligible90: sum("eligible90"),
      retained90: sum("retained90"),
      paid90: sum("paid90"),
    },
  };
}

export function rate(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null;
}
