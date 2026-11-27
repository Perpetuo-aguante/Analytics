"""Orquestación en batch: qué posts analizar, en qué capas, y cómo se guarda.

Cada capa guarda el content_hash del texto y la versión de sus reglas; un
post se vuelve a analizar en una capa cuando cambió su texto, subió la
versión o (capa literaria) cambió el modelo.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass

from . import affect, literary, nlp, norms, stylometry
from .affect import Paragraph
from .llm import LLM
from .vocab import VERSION_AFECTO, VERSION_ESTILOMETRIA, VERSION_PROMPT

CAPAS = ("estilometria", "afecto", "literario")

_PENDING_SQL = """
select p.id::text as post_id, p.slug, p.title, t.body, t.content_hash,
       s.content_hash as s_hash, s.version as s_version,
       a.content_hash as a_hash, a.version as a_version, a.llm_hash,
       a.distancia_afectiva, a.distancia_evidencia, a.distancia_confianza,
       a.ironia, a.ironia_evidencia, a.ironia_confianza,
       l.content_hash as l_hash, l.prompt_version, l.modelo
from post_texts t
join posts p on p.id = t.post_id
left join post_stylometry s on s.post_id = t.post_id
left join post_affect a on a.post_id = t.post_id
left join post_literary l on l.post_id = t.post_id
{where}
order by p.published_at desc nulls last
"""


@dataclass
class Plan:
    row: dict
    capas: list[str]


def plan(conn, capas: list[str], slug: str | None, forzar: bool, modelo: str | None) -> list[Plan]:
    where, params = ("where p.slug = %s", (slug,)) if slug else ("", ())
    plans: list[Plan] = []
    for row in conn.execute(_PENDING_SQL.format(where=where), params).fetchall():
        h = row["content_hash"]
        todo = []
        if "estilometria" in capas and (forzar or row["s_hash"] != h or row["s_version"] != VERSION_ESTILOMETRIA):
            todo.append("estilometria")
        if "afecto" in capas and (forzar or row["a_hash"] != h or row["a_version"] != VERSION_AFECTO):
            todo.append("afecto")
        if "literario" in capas and (
            forzar
            or row["l_hash"] != h
            or row["prompt_version"] != VERSION_PROMPT
            or (modelo is not None and row["modelo"] != modelo)
            or row["llm_hash"] != h
        ):
            todo.append("literario")
        if todo:
            plans.append(Plan(row, todo))
    return plans


def _log(conn, post_id: str | None, capa: str, ok: bool, started: float, error: str | None = None, detalle=None):
    conn.execute(
        "insert into analysis_runs (post_id, capa, ok, error, detalle, duracion_ms) values (%s, %s, %s, %s, %s, %s)",
        (post_id, capa, ok, error[:2000] if error else None, json.dumps(detalle, ensure_ascii=False) if detalle else None,
         int((time.monotonic() - started) * 1000)),
    )


def _load_paragraphs(conn, row: dict, paragraphs: list[Paragraph]) -> None:
    """Recupera lo ya calculado de cada párrafo (si el texto no cambió), para
    no perder el baseline al correr solo la capa literaria, ni lo del LLM al
    correr solo la de afecto."""
    baseline_ok = row["a_hash"] == row["content_hash"]
    llm_ok = row["llm_hash"] == row["content_hash"]
    if not (baseline_ok or llm_ok):
        return
    stored = {
        r["idx"]: r
        for r in conn.execute("select * from post_paragraphs where post_id = %s", (row["post_id"],)).fetchall()
    }
    for p in paragraphs:
        r = stored.get(p.idx)
        if not r or r["char_start"] != p.span.start or r["char_end"] != p.span.end:
            continue
        if baseline_ok:
            p.valencia_baseline = _f(r["valencia_baseline"])
            p.emocion_baseline = r["emocion_baseline"]
            p.emocion_baseline_conf = _f(r["emocion_baseline_conf"])
        if llm_ok:
            p.valencia_llm = _f(r["valencia_llm"])
            p.activacion = _f(r["activacion"])
            p.emocion_llm = r["emocion_llm"]
            p.emocion_llm_conf = _f(r["emocion_llm_conf"])


def _f(value) -> float | None:
    return float(value) if value is not None else None


def _write_stylometry(conn, post_id: str, content_hash: str, result: stylometry.Stylometry) -> None:
    data = result.as_dict()
    cols = list(data)
    conn.execute(
        f"""insert into post_stylometry (post_id, content_hash, version, spacy_model, {", ".join(cols)})
            values (%s, %s, %s, %s, {", ".join(["%s"] * len(cols))})
            on conflict (post_id) do update set content_hash = excluded.content_hash, version = excluded.version,
              spacy_model = excluded.spacy_model, {", ".join(f"{c} = excluded.{c}" for c in cols)}, computed_at = now()""",
        (post_id, content_hash, VERSION_ESTILOMETRIA, nlp.model_name(), *data.values()),
    )


def _write_paragraphs(conn, post_id: str, paragraphs: list[Paragraph]) -> None:
    conn.execute("delete from post_paragraphs where post_id = %s", (post_id,))
    with conn.cursor() as cur:
        cur.executemany(
            """insert into post_paragraphs (post_id, idx, char_start, char_end, token_count,
                 valencia_baseline, emocion_baseline, emocion_baseline_conf,
                 valencia_llm, activacion, emocion_llm, emocion_llm_conf, emocion_dominante, emocion_fuente)
               values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            [
                (post_id, p.idx, p.span.start, p.span.end, p.token_count,
                 p.valencia_baseline, p.emocion_baseline, p.emocion_baseline_conf,
                 p.valencia_llm, p.activacion, p.emocion_llm, p.emocion_llm_conf, p.emocion_dominante, p.emocion_fuente)
                for p in paragraphs
            ],
        )


def _write_literary(conn, post_id: str, content_hash: str, model: str, result: literary.LiteraryResult, usage) -> None:
    a = result.analisis
    dims = a.model_dump(exclude={"afecto"})
    for name, bad in result.evidencia_invalida.items():
        if name in dims:
            dims[name]["evidencia_invalida"] = bad
    for ref, bad in zip(dims["intertextualidad"]["referencias"], result.referencias_invalidas):
        ref["evidencia_invalida"] = bad
    for img, bad in zip(dims["figuracion"]["imagenes_recurrentes"], result.imagenes_invalidas):
        img["evidencia_invalida"] = bad

    conn.execute(
        """insert into post_literary (post_id, content_hash, prompt_version, modelo,
             compass_x, compass_x_confianza, compass_y, compass_y_confianza,
             narrador, focalizacion, distancia_narrativa, num_voces, voces_con_agencia, contraparte,
             orden_temporal, ritmo_dominante, tesis, estructura, autoridad, polo_dominante,
             dificultad, tipo_gancho, fuerza_gancho, cierre,
             dimensiones, campos_evidencia_invalida, secciones, tokens_entrada, tokens_salida, analyzed_at)
           values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                   %s, %s, %s, %s, %s, %s, %s, %s, %s, now())
           on conflict (post_id) do update set
             content_hash = excluded.content_hash, prompt_version = excluded.prompt_version, modelo = excluded.modelo,
             compass_x = excluded.compass_x, compass_x_confianza = excluded.compass_x_confianza,
             compass_y = excluded.compass_y, compass_y_confianza = excluded.compass_y_confianza,
             narrador = excluded.narrador, focalizacion = excluded.focalizacion,
             distancia_narrativa = excluded.distancia_narrativa, num_voces = excluded.num_voces,
             voces_con_agencia = excluded.voces_con_agencia, contraparte = excluded.contraparte,
             orden_temporal = excluded.orden_temporal, ritmo_dominante = excluded.ritmo_dominante,
             tesis = excluded.tesis, estructura = excluded.estructura, autoridad = excluded.autoridad,
             polo_dominante = excluded.polo_dominante, dificultad = excluded.dificultad,
             tipo_gancho = excluded.tipo_gancho, fuerza_gancho = excluded.fuerza_gancho, cierre = excluded.cierre,
             dimensiones = excluded.dimensiones, campos_evidencia_invalida = excluded.campos_evidencia_invalida,
             secciones = excluded.secciones, tokens_entrada = excluded.tokens_entrada,
             tokens_salida = excluded.tokens_salida, analyzed_at = now()""",
        (
            post_id, content_hash, VERSION_PROMPT, model,
            a.eje_x.score, a.eje_x.confianza, a.eje_y.score, a.eje_y.confianza,
            a.enunciacion.narrador, a.enunciacion.focalizacion, a.enunciacion.distancia,
            a.polifonia.num_voces, a.polifonia.voces_con_agencia, a.polifonia.contraparte,
            a.tiempo.orden, a.tiempo.ritmo_dominante,
            a.argumentacion.tesis, a.argumentacion.estructura, a.argumentacion.autoridad,
            a.figuracion.polo_dominante, a.lector_implicito.dificultad,
            a.apertura.tipo_gancho, a.apertura.fuerza_gancho, a.cierre.tipo,
            json.dumps(dims, ensure_ascii=False), result.campos_invalidos, result.secciones,
            usage.entrada, usage.salida,
        ),
    )
    conn.execute("delete from post_themes where post_id = %s", (post_id,))
    seen: set[str] = set()
    for t in a.temas.temas:
        if t.tema not in seen:
            seen.add(t.tema)
            conn.execute("insert into post_themes (post_id, tema, peso) values (%s, %s, %s)", (post_id, t.tema, t.peso))
    conn.execute("delete from post_references where post_id = %s", (post_id,))
    for ref, bad in zip(a.intertextualidad.referencias, result.referencias_invalidas):
        conn.execute(
            """insert into post_references (post_id, autor, obra, tipo, tradicion, evidencia, evidencia_invalida)
               values (%s, %s, %s, %s, %s, %s, %s)""",
            (post_id, ref.autor, ref.obra, ref.tipo, ref.tradicion, ref.evidencia, bad),
        )


def _write_affect(conn, row: dict, paragraphs: list[Paragraph], baseline_ok: bool, llm: dict | None) -> None:
    agg = affect.aggregate(paragraphs)
    conn.execute(
        """insert into post_affect (post_id, content_hash, version, baseline_model, arco, arco_ajuste, valencia_media,
             activacion_media, rango_valencia, distancia_afectiva, distancia_evidencia, distancia_confianza,
             ironia, ironia_evidencia, ironia_confianza, llm_hash, computed_at)
           values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, now())
           on conflict (post_id) do update set content_hash = excluded.content_hash, version = excluded.version,
             baseline_model = excluded.baseline_model, arco = excluded.arco, arco_ajuste = excluded.arco_ajuste,
             valencia_media = excluded.valencia_media, activacion_media = excluded.activacion_media,
             rango_valencia = excluded.rango_valencia, distancia_afectiva = excluded.distancia_afectiva,
             distancia_evidencia = excluded.distancia_evidencia, distancia_confianza = excluded.distancia_confianza,
             ironia = excluded.ironia, ironia_evidencia = excluded.ironia_evidencia,
             ironia_confianza = excluded.ironia_confianza, llm_hash = excluded.llm_hash, computed_at = now()""",
        (
            row["post_id"], row["content_hash"],
            # Sin baseline la fila existe solo por lo del LLM: versión vacía
            # para que la capa de afecto siga pendiente.
            VERSION_AFECTO if baseline_ok else "",
            affect.baseline_model_name() if baseline_ok else None,
            agg.arco, agg.arco_ajuste, agg.valencia_media, agg.activacion_media, agg.rango_valencia,
            llm and llm["distancia_afectiva"], llm and llm["distancia_evidencia"], llm and llm["distancia_confianza"],
            llm and llm["ironia"], llm and llm["ironia_evidencia"], llm and llm["ironia_confianza"],
            row["content_hash"] if llm else None,
        ),
    )


def process(conn, plan_item: Plan, llm: LLM | None, log=print) -> dict[str, str]:
    row = plan_item.row
    post_id = row["post_id"]
    body = row["body"]
    doc = nlp.load()(body)
    paragraphs = affect.segment(body, doc)
    _load_paragraphs(conn, row, paragraphs)
    outcome: dict[str, str] = {}

    baseline_ok = row["a_hash"] == row["content_hash"] and row["a_version"] == VERSION_AFECTO
    llm_fields = (
        {k: row[k] for k in ("distancia_afectiva", "distancia_evidencia", "distancia_confianza",
                             "ironia", "ironia_evidencia", "ironia_confianza")}
        if row["llm_hash"] == row["content_hash"] else None
    )
    touched_affect = False

    for capa in plan_item.capas:
        started = time.monotonic()
        try:
            with conn.transaction():
                if capa == "estilometria":
                    _write_stylometry(conn, post_id, row["content_hash"], stylometry.compute(body, doc))
                elif capa == "afecto":
                    affect.run_baseline(paragraphs, body, doc)
                    baseline_ok = True
                    touched_affect = True
                elif capa == "literario":
                    if llm is None:
                        raise RuntimeError("Sin LLM configurado.")
                    llm.usage = type(llm.usage)()
                    result = literary.analyze(
                        llm, row["title"], body, [(p.idx, p.span.text(body), p.token_count) for p in paragraphs]
                    )
                    _write_literary(conn, post_id, row["content_hash"], llm.model, result, llm.usage)
                    by_idx = {p.idx: p for p in result.parrafos}
                    for p in paragraphs:
                        lp = by_idx.get(p.idx)
                        p.valencia_llm = lp.valencia if lp else None
                        p.activacion = lp.activacion if lp else None
                        p.emocion_llm = lp.emocion if lp else None
                        p.emocion_llm_conf = lp.confianza if lp else None
                    af = result.analisis.afecto
                    llm_fields = {
                        "distancia_afectiva": af.distancia_afectiva.valor,
                        "distancia_evidencia": af.distancia_afectiva.evidencia,
                        "distancia_confianza": af.distancia_afectiva.confianza,
                        "ironia": af.ironia.valor,
                        "ironia_evidencia": list(af.ironia.evidencia),
                        "ironia_confianza": af.ironia.confianza,
                    }
                    touched_affect = True
                    outcome["evidencia_invalida"] = ",".join(result.campos_invalidos) or "ninguna"
            _log(conn, post_id, capa, True, started, detalle=outcome or None)
            outcome[capa] = "ok"
        except Exception as err:  # noqa: BLE001 - se registra y se sigue con lo demás
            _log(conn, post_id, capa, False, started, error=f"{type(err).__name__}: {err}")
            outcome[capa] = f"error: {err}"
            log(f"  ✗ {capa}: {err}")

    if touched_affect:
        with conn.transaction():
            _write_paragraphs(conn, post_id, paragraphs)
            _write_affect(conn, row, paragraphs, baseline_ok, llm_fields)
    conn.commit()
    return outcome


def run(conn, capas: list[str], slug: str | None = None, forzar: bool = False, limite: int | None = None,
        llm: LLM | None = None, log=print) -> None:
    plans = plan(conn, capas, slug, forzar, llm.model if llm else None)
    if limite:
        plans = plans[:limite]
    log(f"{len(plans)} posts por analizar.")
    for i, item in enumerate(plans, start=1):
        log(f"[{i}/{len(plans)}] {item.row['slug']} → {', '.join(item.capas)}")
        process(conn, item, llm, log)

    started = time.monotonic()
    if norms.needs_refresh(conn):
        size = norms.refresh(conn)
        _log(conn, None, "normas", True, started, detalle={"corpus": size})
        log(f"Normas de estilometría recalculadas sobre {size} posts.")
    conn.commit()
