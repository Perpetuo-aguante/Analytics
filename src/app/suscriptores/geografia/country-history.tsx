"use client";

// El histórico por país, con dos lecturas del mismo dato:
//
//   Suscriptores  — cuántos hay en cada país al cierre de cada mes.
//   % del total   — cuánto pesa cada país sobre la lista de ese mes.
//
// Las dos hacen falta y responden preguntas distintas: mientras la lista
// crece, un país puede sumar suscriptores todos los meses y aun así estar
// perdiendo peso. Con una sola de las dos vistas, "España a la baja" o se ve
// o no se ve según cuál se haya elegido.
//
// El selector es estado local y no de la URL: no recorta datos, solo cambia
// la escala del eje del chart que tiene al lado.

import { useState } from "react";
import { MultiLineChart, type LineSeries } from "@/components/multi-line-chart";

const VIEWS = [
  { key: "conteo", label: "Suscriptores" },
  { key: "peso", label: "% del total" },
] as const;

type ViewKey = (typeof VIEWS)[number]["key"];

export function CountryHistory({
  countSeries,
  shareSeries,
}: {
  countSeries: LineSeries[];
  shareSeries: LineSeries[];
}) {
  const [view, setView] = useState<ViewKey>("conteo");
  const isShare = view === "peso";

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {VIEWS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setView(option.key)}
            className="chip"
            data-active={option.key === view}
            aria-pressed={option.key === view}
          >
            {option.label}
          </button>
        ))}
      </div>
      <MultiLineChart
        series={isShare ? shareSeries : countSeries}
        title={isShare ? "Peso de cada país sobre la lista, mes a mes" : "Suscriptores por país, mes a mes"}
        percent={isShare}
      />
    </div>
  );
}
