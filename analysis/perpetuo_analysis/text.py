"""Párrafos y normalización de texto, compartidos por las tres capas."""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

# Un párrafo con menos de estos tokens se fusiona con el siguiente (spec,
# capa 2). Así un título, una línea de diálogo o un verso suelto no cuentan
# como un "párrafo" con afecto propio.
MIN_PARAGRAPH_TOKENS = 15


@dataclass(frozen=True)
class Span:
    start: int
    end: int

    def text(self, body: str) -> str:
        return body[self.start:self.end]


def raw_paragraphs(body: str) -> list[Span]:
    """Párrafos tal como vienen: bloques separados por una línea en blanco.

    Si el texto no tiene ninguna línea en blanco (algunos exports pegan cada
    párrafo en una línea), cada línea es un párrafo.
    """
    separator = r"\n[ \t]*\n" if re.search(r"\n[ \t]*\n", body) else r"\n"
    spans: list[Span] = []
    pos = 0
    for match in re.finditer(separator, body):
        _push(spans, body, pos, match.start())
        pos = match.end()
    _push(spans, body, pos, len(body))
    return spans


def _push(spans: list[Span], body: str, start: int, end: int) -> None:
    chunk = body[start:end]
    stripped = chunk.strip()
    if not stripped:
        return
    offset = start + chunk.index(stripped)
    spans.append(Span(offset, offset + len(stripped)))


def merge_short(spans: list[Span], token_counts: list[int], minimum: int = MIN_PARAGRAPH_TOKENS) -> list[tuple[Span, int]]:
    """Fusiona cada párrafo de menos de `minimum` tokens con el siguiente.

    Si el último queda corto, se fusiona con el anterior. Devuelve
    (span, tokens) de los párrafos resultantes.
    """
    merged: list[tuple[Span, int]] = []
    pending: tuple[Span, int] | None = None
    for span, count in zip(spans, token_counts):
        if pending is not None:
            span, count = Span(pending[0].start, span.end), pending[1] + count
            pending = None
        if count < minimum:
            pending = (span, count)
        else:
            merged.append((span, count))
    if pending is not None:
        if merged:
            last_span, last_count = merged.pop()
            merged.append((Span(last_span.start, pending[0].end), last_count + pending[1]))
        else:
            merged.append(pending)
    return merged


_QUOTES = str.maketrans({"“": '"', "”": '"', "«": '"', "»": '"', "„": '"', "‘": "'", "’": "'", "´": "'"})


def normalize_for_match(text: str) -> str:
    """Forma canónica para validar evidencia (spec, «Regla de evidencia»):
    sin acentos, minúsculas, espacios colapsados. Además unifica comillas
    tipográficas, porque el LLM suele cambiar «» por "" al citar."""
    text = unicodedata.normalize("NFD", text)
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    text = text.translate(_QUOTES).lower()
    return re.sub(r"\s+", " ", text).strip()


class EvidenceIndex:
    """Comprueba que una cita exista literalmente en el texto."""

    def __init__(self, body: str):
        self._haystack = normalize_for_match(body)

    def contains(self, quote: str | None) -> bool:
        if not quote:
            return False
        needle = normalize_for_match(quote).strip(" \"'.,;:")
        return len(needle) >= 3 and needle in self._haystack
