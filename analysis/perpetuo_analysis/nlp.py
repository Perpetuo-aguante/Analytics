"""Carga perezosa del modelo de spaCy (pesa ~500 MB: solo una vez por proceso)."""

from __future__ import annotations

import os
from functools import lru_cache

DEFAULT_MODEL = "es_core_news_lg"


def model_name() -> str:
    return os.environ.get("SPACY_MODEL", DEFAULT_MODEL)


@lru_cache(maxsize=1)
def load():
    import spacy

    nlp = spacy.load(model_name())
    nlp.max_length = 2_000_000
    return nlp
