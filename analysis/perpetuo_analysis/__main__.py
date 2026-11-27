"""Línea de comandos del worker.

  python -m perpetuo_analysis run [--capas estilometria,afecto,literario] [--slug S] [--limite N] [--forzar]
  python -m perpetuo_analysis normas
  python -m perpetuo_analysis borrador archivo.txt [--titulo T] [--sin-llm]

`run` analiza en batch los posts con texto que tengan alguna capa pendiente
(texto nuevo o cambiado, o versión de reglas/modelo distinta). `borrador`
analiza un texto que no está en la base (un borrador final) y lo imprime
como JSON, sin guardar nada; si hay DATABASE_URL, agrega los z-scores y los
posts más cercanos en el compass.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from pathlib import Path

from . import affect, literary, nlp, norms, pipeline, stylometry


def _llm_or_none(required: bool):
    from .llm import LLM

    try:
        return LLM()
    except RuntimeError as err:
        if required:
            raise
        print(f"Aviso: {err} La capa literaria queda pendiente.", file=sys.stderr)
        return None


def cmd_run(args) -> None:
    from .db import connect

    capas = [c.strip() for c in args.capas.split(",") if c.strip()]
    unknown = set(capas) - set(pipeline.CAPAS)
    if unknown:
        sys.exit(f"Capas desconocidas: {', '.join(sorted(unknown))}. Válidas: {', '.join(pipeline.CAPAS)}")
    llm = _llm_or_none(required=False) if "literario" in capas else None
    if llm is None and "literario" in capas:
        capas.remove("literario")
    with connect() as conn:
        pipeline.run(conn, capas, slug=args.slug, forzar=args.forzar, limite=args.limite, llm=llm)


def cmd_normas(_args) -> None:
    from .db import connect

    with connect() as conn:
        size = norms.refresh(conn)
        conn.commit()
    print(f"Normas recalculadas sobre {size} posts.")


def cmd_borrador(args) -> None:
    body_raw = Path(args.archivo).read_text(encoding="utf-8")
    # La misma normalización que aplica la ingesta (lib/text-analysis.ts).
    body = re.sub(r"\n{3,}", "\n\n", re.sub(r"[ \t\u00a0]+$", "", body_raw.lstrip("\ufeff").replace("\r\n", "\n"), flags=re.M)).strip()
    doc = nlp.load()(body)
    report: dict = {"titulo": args.titulo or Path(args.archivo).stem}

    style = stylometry.compute(body, doc)
    report["estilometria"] = style.as_dict()

    paragraphs = affect.segment(body, doc)
    try:
        affect.run_baseline(paragraphs, body, doc)
    except Exception as err:  # noqa: BLE001 - sin baseline, el resto del informe sirve igual
        print(f"Aviso: sin baseline de afecto ({type(err).__name__}: {str(err)[:200]})", file=sys.stderr)

    if not args.sin_llm:
        llm = _llm_or_none(required=True)
        result = literary.analyze(llm, report["titulo"], body, [(p.idx, p.span.text(body), p.token_count) for p in paragraphs])
        by_idx = {p.idx: p for p in result.parrafos}
        for p in paragraphs:
            lp = by_idx.get(p.idx)
            if lp:
                p.valencia_llm, p.activacion, p.emocion_llm, p.emocion_llm_conf = lp.valencia, lp.activacion, lp.emocion, lp.confianza
        report["literario"] = result.analisis.model_dump()
        report["evidencia_invalida"] = result.campos_invalidos
        report["tokens"] = {"entrada": llm.usage.entrada, "salida": llm.usage.salida, "llamadas": llm.usage.llamadas}

    agg = affect.aggregate(paragraphs)
    report["afecto"] = {
        **agg.__dict__,
        "parrafos": [
            {"idx": p.idx, "inicio": p.span.text(body)[:80], "valencia": p.valencia_baseline, "activacion": p.activacion,
             "emocion": p.emocion_dominante, "fuente": p.emocion_fuente}
            for p in paragraphs
        ],
    }

    try:
        from .db import connect

        with connect() as conn:
            stats = {r["feature"]: r for r in conn.execute("select * from stylometry_norms").fetchall()}
            report["estilometria_z"] = {
                f: (round((style.as_dict()[f] - stats[f]["media"]) / stats[f]["desviacion"], 2)
                    if f in stats and stats[f]["desviacion"] and style.as_dict()[f] is not None else None)
                for f in stylometry.FEATURES
            }
            if "literario" in report:
                x, y = report["literario"]["eje_x"]["score"], report["literario"]["eje_y"]["score"]
                rows = conn.execute(
                    "select p.slug, p.title, l.compass_x, l.compass_y from post_literary l join posts p on p.id = l.post_id"
                ).fetchall()
                rows.sort(key=lambda r: math.hypot(r["compass_x"] - x, r["compass_y"] - y))
                report["cercanos_en_compass"] = [
                    {"slug": r["slug"], "titulo": r["title"], "x": r["compass_x"], "y": r["compass_y"]} for r in rows[:5]
                ]
    except Exception as err:  # noqa: BLE001 - la base es opcional para un borrador
        print(f"Aviso: sin base de datos ({err}); sin z-scores ni vecinos.", file=sys.stderr)

    print(json.dumps(report, ensure_ascii=False, indent=2, default=str))


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="perpetuo_analysis", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)

    run = sub.add_parser("run", help="Analiza en batch los posts pendientes.")
    run.add_argument("--capas", default=",".join(pipeline.CAPAS))
    run.add_argument("--slug")
    run.add_argument("--limite", type=int)
    run.add_argument("--forzar", action="store_true", help="Re-analiza aunque nada haya cambiado.")
    run.set_defaults(func=cmd_run)

    sub.add_parser("normas", help="Recalcula media y desviación de la estilometría.").set_defaults(func=cmd_normas)

    draft = sub.add_parser("borrador", help="Analiza un .txt sin guardarlo.")
    draft.add_argument("archivo")
    draft.add_argument("--titulo")
    draft.add_argument("--sin-llm", action="store_true")
    draft.set_defaults(func=cmd_borrador)

    args = parser.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()
