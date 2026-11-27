"""Capa 1: estilometría computable (spaCy, sin LLM).

Determinista y barata: ancla los ejes del compass con números verificables
y permite detectar cuando el LLM alucina. Las features se guardan crudas;
la comparación entre posts usa z-scores sobre el corpus (ver norms.py).
"""

from __future__ import annotations

import re
import statistics
from dataclasses import asdict, dataclass

from .text import raw_paragraphs

FEATURES = (
    "oracion_long_media",
    "oracion_long_cv",
    "mtld",
    "densidad_lexica",
    "ratio_primera_persona",
    "densidad_referencial",
    "densidad_adjetival",
    "profundidad_sintactica",
    "ratio_subordinacion",
    "densidad_citas",
    "ratio_dialogo",
    "ratio_interrogativas",
)

CONTENT_POS = {"NOUN", "PROPN", "VERB", "ADJ", "ADV"}
FIRST_PERSON_PRONOUNS = {"yo", "me", "mí", "conmigo", "nosotros", "nosotras"}
# Cláusulas subordinadas en Universal Dependencies: adverbiales, completivas,
# sujetos oracionales y relativas. xcomp (infinitivo de control) no cuenta:
# no es una cláusula con sujeto propio.
SUBORDINATE_DEPS = {"advcl", "ccomp", "csubj", "csubj:pass", "acl", "acl:relcl"}

MONTHS = "enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre"
# Los modelos de spaCy en español no etiquetan fechas ni porcentajes (su NER
# solo tiene PER, LOC, ORG y MISC), así que se buscan con expresiones.
DATE_RE = re.compile(
    rf"\b\d{{1,2}}\s+de\s+(?:{MONTHS})(?:\s+(?:de|del)\s+\d{{4}})?\b"
    rf"|\b(?:{MONTHS})\s+(?:de|del)\s+\d{{4}}\b"
    rf"|\b\d{{1,2}}/\d{{1,2}}/\d{{2,4}}\b"
    rf"|\b(?:en|de|desde|hasta|hacia)\s+(?:1[5-9]|20)\d{{2}}\b"
    rf"|\b(?:años|década\s+de)\s+(?:los\s+)?\d{{2,4}}\b",
    re.IGNORECASE,
)
PERCENT_RE = re.compile(r"\d+(?:[.,]\d+)?\s?%|\d+(?:[.,]\d+)?\s+por\s+ciento", re.IGNORECASE)
# Fragmentos citados: entre comillas, de al menos tres palabras (para no
# contar comillas irónicas ni títulos de una palabra).
QUOTE_RE = re.compile(r"[«“\"]([^«»“”\"]{3,}?)[»”\"]")
DIALOGUE_START = re.compile(r"^\s*(?:[—–]|-\s|[«“\"])")
BLOCKQUOTE_START = re.compile(r"^\s*>")


@dataclass
class Stylometry:
    oracion_long_media: float | None
    oracion_long_cv: float | None
    mtld: float | None
    densidad_lexica: float | None
    ratio_primera_persona: float | None
    densidad_referencial: float | None
    densidad_adjetival: float | None
    profundidad_sintactica: float | None
    ratio_subordinacion: float | None
    densidad_citas: float | None
    ratio_dialogo: float | None
    ratio_interrogativas: float | None
    longitud_tokens: int
    num_oraciones: int
    num_parrafos: int

    def as_dict(self) -> dict:
        return asdict(self)


def is_word(token) -> bool:
    return not (token.is_punct or token.is_space or token.is_quote or token.is_bracket)


def mtld(words: list[str], threshold: float = 0.72) -> float | None:
    """Measure of Textual Lexical Diversity (McCarthy y Jarvis, 2010).

    Promedio de la pasada hacia adelante y hacia atrás. A diferencia del
    type-token ratio, no depende de la longitud del texto.
    """
    if len(words) < 10:
        return None

    def one_pass(seq: list[str]) -> float:
        factors = 0.0
        types: set[str] = set()
        count = 0
        ttr = 1.0
        for word in seq:
            count += 1
            types.add(word)
            ttr = len(types) / count
            if ttr <= threshold:
                factors += 1
                types = set()
                count = 0
                ttr = 1.0
        if count > 0:
            factors += (1 - ttr) / (1 - threshold)
        return len(seq) / factors if factors > 0 else float(len(seq))

    return (one_pass(words) + one_pass(list(reversed(words)))) / 2


def _depth(token) -> int:
    depth = 0
    while token.head.i != token.i:
        token = token.head
        depth += 1
    return depth


def _ratio(numerator: float, denominator: float) -> float | None:
    return numerator / denominator if denominator else None


def _is_reference_entity(ent) -> bool:
    """El NER de los modelos de spaCy en español marca como MISC cualquier
    tramo que empiece con mayúscula ("Me quedé quieto en el pasillo"), lo que
    inflaría la densidad referencial de la prosa narrativa. Cuentan PER, LOC
    y ORG, y MISC solo si es un nombre propio (todo PROPN, ej. "Pedro
    Páramo")."""
    if ent.label_ in {"PER", "LOC", "ORG"}:
        return True
    return ent.label_ == "MISC" and all(t.pos_ in {"PROPN", "NUM", "DET", "ADP"} for t in ent) and any(
        t.pos_ == "PROPN" for t in ent
    )


def _reference_count(body: str, doc) -> int:
    """Entidades + cifras + fechas + porcentajes, sin contar dos veces una
    cifra que ya es parte de una fecha o un porcentaje."""
    covered: list[tuple[int, int]] = []
    count = 0
    for regex in (DATE_RE, PERCENT_RE):
        for match in regex.finditer(body):
            if any(s < match.end() and match.start() < e for s, e in covered):
                continue
            covered.append(match.span())
            count += 1
    for ent in doc.ents:
        if not _is_reference_entity(ent):
            continue
        if not any(s < ent.end_char and ent.start_char < e for s, e in covered):
            covered.append((ent.start_char, ent.end_char))
            count += 1
    for token in doc:
        if token.like_num or token.pos_ == "NUM":
            if not any(s <= token.idx < e for s, e in covered):
                count += 1
    return count


def compute(body: str, doc) -> Stylometry:
    words = [t for t in doc if is_word(t)]
    sentences = [s for s in doc.sents if any(is_word(t) for t in s)]
    sentence_lengths = [sum(1 for t in s if is_word(t)) for s in sentences]
    paragraphs = [p.text(body) for p in raw_paragraphs(body)]

    verbs = [t for t in words if t.pos_ in {"VERB", "AUX"}]
    first_person_verbs = sum(1 for t in verbs if "1" in t.morph.get("Person"))
    first_person_pronouns = sum(1 for t in words if t.lower_ in FIRST_PERSON_PRONOUNS)

    nouns = sum(1 for t in words if t.pos_ == "NOUN")
    adjectives = sum(1 for t in words if t.pos_ == "ADJ")
    content = sum(1 for t in words if t.pos_ in CONTENT_POS)

    depths = [max((_depth(t) for t in s), default=0) for s in sentences]
    subordinates = sum(1 for t in doc if t.dep_ in SUBORDINATE_DEPS)

    quotes = sum(1 for m in QUOTE_RE.finditer(body) if len(m.group(1).split()) >= 3)
    blockquotes = sum(1 for p in paragraphs if BLOCKQUOTE_START.match(p))
    dialogue = sum(1 for p in paragraphs if DIALOGUE_START.match(p))
    questions = sum(1 for s in sentences if "?" in s.text)

    mean_len = statistics.fmean(sentence_lengths) if sentence_lengths else None
    cv = (
        statistics.pstdev(sentence_lengths) / mean_len
        if mean_len and len(sentence_lengths) > 1
        else None
    )

    return Stylometry(
        oracion_long_media=mean_len,
        oracion_long_cv=cv,
        mtld=mtld([t.lower_ for t in words if t.is_alpha]),
        densidad_lexica=_ratio(content, len(words)),
        ratio_primera_persona=_ratio(first_person_verbs + first_person_pronouns, len(verbs)),
        densidad_referencial=_ratio(_reference_count(body, doc) * 100, len(words)),
        densidad_adjetival=_ratio(adjectives, nouns),
        # Profundidad máxima del árbol de cada oración, promediada.
        profundidad_sintactica=statistics.fmean(depths) if depths else None,
        ratio_subordinacion=_ratio(subordinates, len(sentences)),
        densidad_citas=_ratio(quotes + blockquotes, len(paragraphs)),
        ratio_dialogo=_ratio(dialogue, len(paragraphs)),
        ratio_interrogativas=_ratio(questions, len(sentences)),
        longitud_tokens=len(words),
        num_oraciones=len(sentences),
        num_parrafos=len(paragraphs),
    )
