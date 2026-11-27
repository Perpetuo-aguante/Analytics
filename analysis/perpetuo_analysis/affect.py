"""Capa 2: afecto y arco emocional.

La polaridad sola no sirve para literatura (un ensayo melancólico excelente
sale "negativo"), así que se mide por separado, por párrafo: valencia,
activación y emoción dominante; y por post: arco, medias, rango, distancia
afectiva e ironía.

Reparto (spec): pysentimiento da el baseline de valencia y emoción por
párrafo; el LLM (capa 3) da activación, distancia afectiva e ironía, y
corrige la emoción dominante cuando su confianza es mayor. Se guardan las
dos salidas.
"""

from __future__ import annotations

import math
import os
import statistics
from dataclasses import dataclass
from functools import lru_cache

from .text import Span, merge_short, raw_paragraphs
from .vocab import ARCOS

# pysentimiento usa modelos con contexto corto (RoBERTuito: 128 tokens). Un
# párrafo largo se parte en trozos de a lo sumo esto palabras, siguiendo las
# oraciones, y sus probabilidades se promedian ponderadas por longitud.
MAX_WORDS_PER_CHUNK = 90
MIN_PARAGRAPHS_FOR_ARC = 6

# Etiquetas de pysentimiento (EmoEvent) → vocabulario del spec. El baseline
# no conoce nostalgia, asombro ni ternura: esas solo las puede dar el LLM.
EMOTION_MAP = {
    "joy": "alegría",
    "sadness": "tristeza",
    "anger": "ira",
    "fear": "miedo",
    "surprise": "sorpresa",
    "disgust": "asco",
    "others": "neutra",
}


@dataclass
class Paragraph:
    idx: int
    span: Span
    token_count: int
    valencia_baseline: float | None = None
    emocion_baseline: str | None = None
    emocion_baseline_conf: float | None = None
    valencia_llm: float | None = None
    activacion: float | None = None
    emocion_llm: str | None = None
    emocion_llm_conf: float | None = None

    @property
    def emocion_dominante(self) -> str | None:
        return self._winner()[0]

    @property
    def emocion_fuente(self) -> str | None:
        return self._winner()[1]

    def _winner(self) -> tuple[str | None, str | None]:
        if self.emocion_llm and (
            self.emocion_baseline is None or (self.emocion_llm_conf or 0) > (self.emocion_baseline_conf or 0)
        ):
            return self.emocion_llm, "llm"
        if self.emocion_baseline:
            return self.emocion_baseline, "baseline"
        return None, None


def segment(body: str, doc) -> list[Paragraph]:
    """Párrafos del post para el análisis afectivo (fusionando los cortos).

    `doc` es el Doc de spaCy del texto completo: los tokens se cuentan con
    él para que "15 tokens" signifique lo mismo que en la estilometría.
    """
    spans = raw_paragraphs(body)
    counts = [
        sum(1 for t in (doc.char_span(s.start, s.end, alignment_mode="expand") or []) if not (t.is_punct or t.is_space))
        for s in spans
    ]
    return [Paragraph(idx=i, span=span, token_count=count) for i, (span, count) in enumerate(merge_short(spans, counts))]


# ── Baseline con pysentimiento ──────────────────────────────────────────────


def baseline_model_name() -> str:
    return "pysentimiento/robertuito-sentiment-analysis+emotion-analysis"


@lru_cache(maxsize=1)
def _analyzers():
    try:
        from pysentimiento import create_analyzer
    except ImportError as err:  # pragma: no cover - depende del entorno
        raise RuntimeError(
            "Falta pysentimiento (y torch). Instala analysis/requirements.txt para correr la capa de afecto."
        ) from err
    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
    return create_analyzer(task="sentiment", lang="es"), create_analyzer(task="emotion", lang="es")


def _chunks(paragraph_doc) -> list[str]:
    chunks: list[str] = []
    current: list[str] = []
    words = 0
    for sent in paragraph_doc.sents:
        n = sum(1 for t in sent if not t.is_punct and not t.is_space)
        if current and words + n > MAX_WORDS_PER_CHUNK:
            chunks.append(" ".join(current))
            current, words = [], 0
        current.append(sent.text.strip())
        words += n
    if current:
        chunks.append(" ".join(current))
    return [c for c in chunks if c]


def run_baseline(paragraphs: list[Paragraph], body: str, doc) -> None:
    sentiment, emotion = _analyzers()
    for p in paragraphs:
        span = doc.char_span(p.span.start, p.span.end, alignment_mode="expand")
        texts = _chunks(span) if span is not None else [p.span.text(body)]
        if not texts:
            continue
        weights = [max(len(t.split()), 1) for t in texts]
        total = sum(weights)
        s_out = sentiment.predict(texts)
        e_out = emotion.predict(texts)
        s_out = s_out if isinstance(s_out, list) else [s_out]
        e_out = e_out if isinstance(e_out, list) else [e_out]

        valence = sum(w * (o.probas.get("POS", 0) - o.probas.get("NEG", 0)) for w, o in zip(weights, s_out)) / total
        emotion_probs: dict[str, float] = {}
        for w, o in zip(weights, e_out):
            for label, prob in o.probas.items():
                emotion_probs[label] = emotion_probs.get(label, 0) + w * prob / total
        label, prob = max(emotion_probs.items(), key=lambda kv: kv[1])

        p.valencia_baseline = _clip(valence, -1, 1)
        p.emocion_baseline = EMOTION_MAP.get(label, "neutra")
        p.emocion_baseline_conf = round(prob, 3)


# ── Arco emocional ──────────────────────────────────────────────────────────


def smooth(values: list[float], window: int = 3) -> list[float]:
    """Media móvil centrada; en los bordes, con los vecinos que haya."""
    half = window // 2
    return [statistics.fmean(values[max(0, i - half): i + half + 1]) for i in range(len(values))]


# Plantillas de las seis formas de Reagan et al. (2016) sobre t ∈ [0, 1].
_TEMPLATES = {
    "ascenso": lambda t: t,
    "caída": lambda t: -t,
    "caída-ascenso": lambda t: -math.sin(math.pi * t),
    "ascenso-caída": lambda t: math.sin(math.pi * t),
    "ascenso-caída-ascenso": lambda t: -math.cos(3 * math.pi * t),
    "caída-ascenso-caída": lambda t: math.cos(3 * math.pi * t),
}
assert set(_TEMPLATES) == set(ARCOS)


def _pearson(a: list[float], b: list[float]) -> float | None:
    ma, mb = statistics.fmean(a), statistics.fmean(b)
    da = [x - ma for x in a]
    db = [y - mb for y in b]
    na = math.sqrt(sum(x * x for x in da))
    nb = math.sqrt(sum(y * y for y in db))
    if na < 1e-9 or nb < 1e-9:
        return None
    return sum(x * y for x, y in zip(da, db)) / (na * nb)


def classify_arc(valences: list[float]) -> tuple[str | None, float | None]:
    """Forma de la curva de valencia (suavizada, ventana 3): la plantilla con
    mayor correlación. None si hay menos de 6 párrafos o la curva es plana."""
    if len(valences) < MIN_PARAGRAPHS_FOR_ARC:
        return None, None
    curve = smooth(valences)
    n = len(curve)
    ts = [i / (n - 1) for i in range(n)]
    best: tuple[str | None, float | None] = (None, None)
    for name in ARCOS:
        r = _pearson(curve, [_TEMPLATES[name](t) for t in ts])
        if r is not None and (best[1] is None or r > best[1]):
            best = (name, r)
    return best


@dataclass
class PostAffect:
    arco: str | None
    arco_ajuste: float | None
    valencia_media: float | None
    activacion_media: float | None
    rango_valencia: float | None


def aggregate(paragraphs: list[Paragraph]) -> PostAffect:
    valences = [p.valencia_baseline for p in paragraphs if p.valencia_baseline is not None]
    activations = [p.activacion for p in paragraphs if p.activacion is not None]
    arco, ajuste = classify_arc(valences) if len(valences) == len(paragraphs) else (None, None)
    return PostAffect(
        arco=arco,
        arco_ajuste=round(ajuste, 3) if ajuste is not None else None,
        valencia_media=round(statistics.fmean(valences), 3) if valences else None,
        activacion_media=round(statistics.fmean(activations), 3) if activations else None,
        rango_valencia=round(max(valences) - min(valences), 3) if valences else None,
    )


def _clip(value: float, lo: float, hi: float) -> float:
    return round(min(max(value, lo), hi), 3)
