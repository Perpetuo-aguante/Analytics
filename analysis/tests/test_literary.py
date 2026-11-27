"""Regla de evidencia: una cita inexistente provoca UN reintento de esa
dimensión; si sigue mal, queda marcada como inválida."""

import json

from perpetuo_analysis import literary
from perpetuo_analysis.llm import Usage
from perpetuo_analysis.schemas import Analisis

BODY = (
    "Llegué a la casa de mi abuela cuando ya nadie vivía en ella.\n\n"
    "Mi abuela decía que las casas aprenden a respirar como sus dueños.\n\n"
    "Entendí que no había venido a vender la casa."
)
Q1 = "Llegué a la casa de mi abuela"
Q2 = "las casas aprenden a respirar"
Q3 = "no había venido a vender la casa"


def _dim(**extra):
    return {"evidencia": Q2, "confianza": 0.8, **extra}


def _analysis(bad_x=False):
    return {
        "eje_x": {"score": 60, "confianza": 0.7, "evidencia": [Q2, "una cita inventada que no está" if bad_x else Q3],
                  "justificacion": "Forma y contenido pesan igual."},
        "eje_y": {"score": 80, "confianza": 0.9, "evidencia": [Q1, Q3], "justificacion": "Memoria."},
        "enunciacion": _dim(narrador="autodiegético", focalizacion="interna", distancia="mixta"),
        "polifonia": _dim(num_voces=2, voces_con_agencia=1, contraparte="ausente"),
        "tiempo": _dim(orden="analepsis", ritmo_dominante="sumario"),
        "argumentacion": _dim(tesis="implícita", estructura="inductiva", autoridad="ninguna"),
        "figuracion": _dim(polo_dominante="metafórico", campos_semanticos=["casa", "cuerpo", "memoria"],
                           imagenes_recurrentes=[{"imagen": "casa que respira", "evidencia": Q2}]),
        "intertextualidad": {"referencias": [], "confianza": 0.9},
        "lector_implicito": _dim(dificultad=2, competencias_requeridas=[], lector_modelo="Un lector general."),
        "apertura": {"tipo_gancho": "anécdota", "fuerza_gancho": 4, "evidencia": Q1, "confianza": 0.8},
        "cierre": {"tipo": "epifánico", "evidencia": Q3, "confianza": 0.8},
        "temas": {"temas": [{"tema": "familia", "peso": 0.7}, {"tema": "duelo-muerte", "peso": 0.3}],
                  "evidencia": Q1, "confianza": 0.8},
        "afecto": {
            "distancia_afectiva": {"valor": "contenida", "evidencia": Q3, "confianza": 0.7},
            "ironia": {"valor": False, "evidencia": [], "confianza": 0.8},
            "parrafos": [
                {"idx": 0, "valencia": -0.2, "activacion": 0.3, "emocion": "nostalgia", "confianza": 0.7},
                {"idx": 1, "valencia": 0.3, "activacion": 0.2, "emocion": "ternura", "confianza": 0.8},
                {"idx": 2, "valencia": 0.1, "activacion": 0.4, "emocion": "tristeza", "confianza": 0.6},
                {"idx": 9, "valencia": 0.1, "activacion": 0.4, "emocion": "tristeza", "confianza": 0.6},
            ],
        },
    }


class FakeLLM:
    model = "falso"

    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []
        self.usage = Usage()

    def complete(self, messages, model_cls):
        self.calls.append(model_cls)
        data = self.responses.pop(0)
        return model_cls.model_validate(data), json.dumps(data)


PARAGRAPHS = [(i, t, 20) for i, t in enumerate(BODY.split("\n\n"))]


def test_valid_evidence_single_call():
    llm = FakeLLM([_analysis()])
    result = literary.analyze(llm, "La casa", BODY, PARAGRAPHS)
    assert len(llm.calls) == 1
    assert result.campos_invalidos == []
    assert [p.idx for p in result.parrafos] == [0, 1, 2]  # el idx 9 no existe


def test_invalid_evidence_retries_only_that_dimension():
    fixed = {"eje_x": _analysis()["eje_x"]}
    llm = FakeLLM([_analysis(bad_x=True), fixed])
    result = literary.analyze(llm, "La casa", BODY, PARAGRAPHS)
    assert len(llm.calls) == 2 and list(llm.calls[1].model_fields) == ["eje_x"]
    assert result.campos_invalidos == [] and result.reintentos == ["eje_x"]


def test_still_invalid_after_retry_is_flagged():
    still_bad = {"eje_x": _analysis(bad_x=True)["eje_x"]}
    llm = FakeLLM([_analysis(bad_x=True), still_bad])
    result = literary.analyze(llm, "La casa", BODY, PARAGRAPHS)
    assert result.evidencia_invalida["eje_x"] is True
    assert result.campos_invalidos == ["eje_x"]


def test_long_texts_are_analyzed_by_sections(monkeypatch):
    monkeypatch.setattr(literary, "LONG_TEXT_TOKENS", 30)
    monkeypatch.setattr(literary, "SECTION_TOKENS", 25)
    llm = FakeLLM([_analysis(), _analysis(), _analysis(), _analysis()])
    result = literary.analyze(llm, "La casa", BODY, PARAGRAPHS)
    assert result.secciones == 3 and len(llm.calls) == 4  # 3 secciones + síntesis
    assert all(c is Analisis for c in llm.calls)
