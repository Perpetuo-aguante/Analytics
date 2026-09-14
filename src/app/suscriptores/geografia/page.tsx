import Link from "next/link";
import { Suspense } from "react";
import { BarChart } from "@/components/bar-chart";
import { DivergingBarChart } from "@/components/diverging-bar-chart";
import { MultiLineChart, type LineSeries } from "@/components/multi-line-chart";
import { PageHeader } from "@/components/page-header";
import { Sparkline } from "@/components/sparkline";
import { StatTiles } from "@/components/stat-tiles";
import { TrendBadge } from "@/components/trend-badge";
import { formatNumber, formatPercent } from "@/lib/display";
import { NO_COUNTRY_KEY } from "@/lib/geo";
import { assignSeriesColors } from "@/lib/series-palette";
import {
  GEO_WINDOWS,
  OTHERS_KEY,
  describeGeoTrends,
  getSubscriberGeoDashboard,
  type GeoStat,
} from "@/lib/subscriber-geo";
import { SubscriberTabs } from "../subscriber-tabs";
import { CountryHistory } from "./country-history";
import { GeoChips } from "./geo-chips";

export const dynamic = "force-dynamic";

type SearchParams = { ventana?: string; pais?: string };

// Cuántos países entran en el chart de "quién sube y quién baja". Es un
// ranking de movimiento, no el censo completo: eso está en la tabla.
const MOVERS_LIMIT = 12;

const TREND_COLOR = {
  alza: "var(--blue)",
  baja: "var(--red)",
  estable: "var(--ink-muted)",
} as const;

export default async function SuscriptoresGeografiaPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const d = await getSubscriberGeoDashboard({ window: params.ventana, country: params.pais });

  // El color sigue al país, no a su posición: el orden que se pasa acá es el
  // ranking sobre la base completa, que no cambia al mover la ventana ni al
  // apagar una serie desde la leyenda.
  const countryColors = assignSeriesColors(
    d.countryHistory.map((s) => s.key),
    [OTHERS_KEY]
  );
  const countSeries: LineSeries[] = d.countryHistory.map((s) => ({
    ...s,
    color: countryColors.get(s.key) ?? "var(--blue)",
  }));
  const shareSeries: LineSeries[] = d.countryShareHistory.map((s) => ({
    ...s,
    color: countryColors.get(s.key) ?? "var(--blue)",
  }));

  const regionColors = assignSeriesColors(d.regionHistory.map((s) => s.key));
  const regionSeries: LineSeries[] = d.regionHistory.map((s) => ({
    ...s,
    color: regionColors.get(s.key) ?? "var(--blue)",
  }));

  const listedCountries = d.countries.filter((c) => c.active > 0);
  const topCountry = listedCountries.find((c) => c.key !== NO_COUNTRY_KEY) ?? null;
  const topRegion = [...d.regions].filter((r) => r.active > 0).sort((a, b) => b.active - a.active)[0] ?? null;

  const movers = [...d.risers, ...d.fallers]
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, MOVERS_LIMIT)
    .map((c) => ({ key: c.key, label: c.label, value: c.delta }));

  // La miniatura de cada fila muestra solo la ventana elegida, no la historia
  // entera: si no, un país que explotó hace un año se ve "subiendo" aunque
  // lleve seis meses plano.
  const sparkMonths = Math.max(3, Math.round(d.window.days / 30) + 1);

  const regionBreakdown = d.regions.filter((r) => r.active > 0).map((r) => ({ label: r.label, value: r.active }));

  const provinceTotal = d.provinces.reduce((sum, p) => sum + p.active, 0);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
      <PageHeader
        title="Geografía"
        description="De dónde vienen los suscriptores y cómo cambia con el tiempo: el ranking de países y regiones de hoy, y la historia mes a mes reconstruida desde las fechas de alta y de baja."
        scope={`Ventana de comparación: últimos ${d.window.label}${d.snapshotDate ? ` · carga del ${d.snapshotDate}` : ""}`}
      />

      <SubscriberTabs active="geografia" />

      <Suspense fallback={<div className="mb-8 h-10" />}>
        <div className="panel mb-8 p-4 sm:p-5">
          <GeoChips
            label="Comparar contra"
            param="ventana"
            options={GEO_WINDOWS.map((w) => ({ key: w.key, label: `Hace ${w.label}` }))}
            active={d.window.key}
          />
        </div>
      </Suspense>

      <div className="rise rise-1">
        <StatTiles
          tiles={[
            {
              label: "Activos hoy",
              value: formatNumber(d.totalActive),
              hint: `${d.totalDelta >= 0 ? "+" : "−"}${formatNumber(Math.abs(d.totalDelta))} en ${d.window.label}`,
            },
            {
              label: "Países con suscriptores",
              value: formatNumber(d.countriesWithSubscribers),
              hint: d.withoutCountry > 0 ? `${formatNumber(d.withoutCountry)} sin país declarado` : undefined,
            },
            {
              label: "País principal",
              value: topCountry ? topCountry.label : "—",
              hint: topCountry ? `${formatPercent(topCountry.share)} de la lista` : undefined,
              variant: "text" as const,
            },
            {
              label: "Región principal",
              value: topRegion ? topRegion.label : "—",
              hint: topRegion ? `${formatPercent(topRegion.share)} de la lista` : undefined,
              variant: "text" as const,
            },
          ]}
        />
      </div>

      {d.totalActive === 0 ? (
        <p className="panel p-8 text-sm text-ink-muted">
          Todavía no hay suscriptores cargados. Sube el export de Substack desde{" "}
          <Link href="/subir" className="underline">
            /subir
          </Link>
          .
        </p>
      ) : (
        <div className="space-y-6">
          <section className="panel rise rise-2 p-5 sm:p-6">
            <h2 className="font-display text-lg font-semibold">Quién sube y quién baja</h2>
            <p className="mb-5 mt-1 text-sm text-ink-secondary">{describeGeoTrends(d)}</p>
            <DivergingBarChart data={movers} />
            <p className="mt-4 text-xs text-ink-muted">
              Cambio neto de suscriptores activos por país entre hace {d.window.label} ({d.windowStart}) y hoy. Un
              país entra en el ranking si se movió al menos 3 suscriptores y un 5% de la base que tenía: por debajo
              de eso, un país chico que gana uno o dos taparía a los movimientos reales.
            </p>
          </section>

          <section className="panel rise rise-3 p-5 sm:p-6">
            <h2 className="font-display text-lg font-semibold">Países</h2>
            <p className="mb-5 mt-1 text-sm text-ink-secondary">
              Cada país con suscriptores activos, cuánto pesa en la lista y cómo se movió en la ventana. La columna
              de peso dice si un país que crece igual está perdiendo terreno frente al resto.
            </p>
            <CountryTable countries={listedCountries} sparkMonths={sparkMonths} windowLabel={d.window.label} />
          </section>

          <section className="panel rise rise-4 p-5 sm:p-6">
            <h2 className="font-display text-lg font-semibold">Historia por país</h2>
            <p className="mb-5 mt-1 text-sm text-ink-secondary">
              Suscriptores activos al cierre de cada mes. Los seis países más grandes llevan línea propia; el resto
              se suma en &ldquo;Otros&rdquo;, así que el total de cada mes sigue cuadrando.
            </p>
            <CountryHistory countSeries={countSeries} shareSeries={shareSeries} />
          </section>

          <section className="panel rise rise-4 p-5 sm:p-6">
            <h2 className="font-display text-lg font-semibold">Regiones</h2>
            <p className="mb-5 mt-1 text-sm text-ink-secondary">
              El mismo público, agrupado por región del mundo: es el nivel donde se ve si la lista es
              latinoamericana, europea o repartida.
            </p>
            <div className="space-y-10">
              <BarChart data={regionBreakdown} />
              <MultiLineChart series={regionSeries} title="Suscriptores por región, mes a mes" />
            </div>
            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-ink-muted">
                    <th className="px-2 py-2 font-medium">Región</th>
                    <th className="px-2 py-2 text-right font-medium">Activos</th>
                    <th className="px-2 py-2 text-right font-medium">% de la lista</th>
                    <th className="px-2 py-2 text-right font-medium">Cambio en {d.window.label}</th>
                    <th className="px-2 py-2 text-right font-medium">Altas / bajas</th>
                  </tr>
                </thead>
                <tbody>
                  {d.regions
                    .filter((r) => r.active > 0)
                    .map((region) => (
                      <tr key={region.key} className="border-b border-line/60">
                        <td className="px-2 py-2 font-medium">{region.label}</td>
                        <td className="tnum px-2 py-2 text-right">{formatNumber(region.active)}</td>
                        <td className="tnum px-2 py-2 text-right">{formatPercent(region.share)}</td>
                        <td className="px-2 py-2 text-right">
                          <TrendBadge trend={region.trend} delta={region.delta} growth={region.growth} />
                        </td>
                        <td className="tnum px-2 py-2 text-right text-ink-muted">
                          +{formatNumber(region.signups)} / −{formatNumber(region.cancels)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>

          {d.countriesWithProvinces.length > 0 && (
            <section className="panel rise rise-4 p-5 sm:p-6">
              <h2 className="font-display text-lg font-semibold">Estados y provincias</h2>
              <p className="mb-5 mt-1 text-sm text-ink-secondary">
                Dentro de un país, dónde está el público. Substack solo trae estado/provincia para parte de los
                suscriptores, así que estos conteos son un piso, no el total del país.
              </p>
              <Suspense fallback={<div className="h-10" />}>
                <GeoChips
                  label="País"
                  param="pais"
                  options={d.countriesWithProvinces.slice(0, 8)}
                  active={d.selectedCountry?.key ?? null}
                />
              </Suspense>
              {d.provinces.length === 0 ? (
                <p className="mt-6 text-sm text-ink-muted">Sin estados o provincias cargados para este país.</p>
              ) : (
                <div className="mt-6 overflow-x-auto">
                  <table className="w-full min-w-[480px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-line text-left text-ink-muted">
                        <th className="px-2 py-2 font-medium">
                          {d.selectedCountry ? d.selectedCountry.label : "Provincia"}
                        </th>
                        <th className="px-2 py-2 text-right font-medium">Activos</th>
                        <th className="px-2 py-2 text-right font-medium">% de los localizados</th>
                        <th className="px-2 py-2 text-right font-medium">Cambio en {d.window.label}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.provinces.map((province) => (
                        <tr key={province.label} className="border-b border-line/60">
                          <td className="px-2 py-2 font-medium">{province.label}</td>
                          <td className="tnum px-2 py-2 text-right">{formatNumber(province.active)}</td>
                          <td className="tnum px-2 py-2 text-right">
                            {formatPercent(provinceTotal > 0 ? province.active / provinceTotal : null)}
                          </td>
                          <td className="px-2 py-2 text-right">
                            <TrendBadge
                              trend={province.delta > 0 ? "alza" : province.delta < 0 ? "baja" : "estable"}
                              delta={province.delta}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          <section className="panel rise rise-4 p-5 text-sm text-ink-secondary sm:p-6">
            <h2 className="mb-3 font-display text-lg font-semibold text-ink">Cómo se calcula esto</h2>
            <ul className="space-y-2">
              <li>
                <span className="font-medium text-ink">El histórico se reconstruye</span>, no está guardado: alguien
                cuenta como activo en una fecha si ya se había dado de alta y todavía no había cancelado. Substack
                mantiene a los cancelados en el export con su fecha de baja, así que las bajas están contadas; quien
                haya sido borrado de la lista por completo, no.
              </li>
              <li>
                <span className="font-medium text-ink">El país es el de hoy.</span> Es un atributo que se pisa en
                cada carga, así que si alguien se mudó, toda su historia se cuenta en su país actual.
              </li>
              <li>
                <span className="font-medium text-ink">Las bajas del mes se descuentan en ese mismo mes</span>, sin
                mirar el día exacto. Las comparaciones de la ventana (hoy contra {d.windowStart}) sí usan la fecha
                exacta.
              </li>
              {d.withoutStartDate > 0 && (
                <li>
                  <span className="font-medium text-ink">
                    {formatNumber(d.withoutStartDate)} suscriptores activos no tienen fecha de alta
                  </span>{" "}
                  en el export: cuentan en los totales de hoy, pero quedan fuera de las líneas del histórico.
                </li>
              )}
              <li>
                Los países se normalizan antes de agrupar (&ldquo;Spain&rdquo;, &ldquo;España&rdquo; y
                &ldquo;ES&rdquo; son el mismo país) y cada uno se asigna a su región del mundo.
              </li>
            </ul>
          </section>
        </div>
      )}
    </main>
  );
}

// Cambio de peso en puntos porcentuales. Se redondea antes de decidir el
// signo: un cambio de −0,04 pp es "±0,0 pp", no "−0.0 pp".
function formatPoints(value: number): string {
  const points = Number((value * 100).toFixed(1));
  const sign = points > 0 ? "+" : points < 0 ? "−" : "±";
  return `${sign}${Math.abs(points).toFixed(1)} pp`;
}

function CountryTable({
  countries,
  sparkMonths,
  windowLabel,
}: {
  countries: GeoStat[];
  sparkMonths: number;
  windowLabel: string;
}) {
  return (
    <div className="max-h-[32rem] overflow-auto">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead className="sticky top-0 bg-surface">
          <tr className="border-b border-line text-left text-ink-muted">
            <th className="px-2 py-2 font-medium">País</th>
            <th className="px-2 py-2 font-medium">Región</th>
            <th className="px-2 py-2 text-right font-medium">Activos</th>
            <th className="px-2 py-2 text-right font-medium">% de la lista</th>
            <th className="px-2 py-2 text-right font-medium">Cambio en {windowLabel}</th>
            <th className="px-2 py-2 text-right font-medium">Cambio de peso</th>
            <th className="px-2 py-2 font-medium">Tendencia</th>
            <th className="px-2 py-2 text-right font-medium">Open rate</th>
          </tr>
        </thead>
        <tbody>
          {countries.map((country) => (
            <tr key={country.key} className="border-b border-line/60">
              <td className="px-2 py-2 font-medium">
                {country.rawCountry ? (
                  <Link
                    href={`/suscriptores/lista?pais=${encodeURIComponent(country.rawCountry)}`}
                    className="hover:text-blue hover:underline"
                  >
                    {country.label}
                  </Link>
                ) : (
                  country.label
                )}
              </td>
              <td className="px-2 py-2 text-ink-muted">{country.region ?? "—"}</td>
              <td className="tnum px-2 py-2 text-right">{formatNumber(country.active)}</td>
              <td className="tnum px-2 py-2 text-right">{formatPercent(country.share)}</td>
              <td className="px-2 py-2 text-right">
                <TrendBadge trend={country.trend} delta={country.delta} growth={country.growth} />
              </td>
              <td className="tnum px-2 py-2 text-right text-ink-muted">{formatPoints(country.shareDelta)}</td>
              <td className="px-2 py-2">
                <Sparkline values={country.history.slice(-sparkMonths)} color={TREND_COLOR[country.trend]} />
              </td>
              <td className="tnum px-2 py-2 text-right">{formatPercent(country.avgOpenRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
