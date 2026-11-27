"""Capa 3: análisis literario con LLM, con la regla de evidencia del spec.

- Toda cita de evidencia tiene que existir literalmente en el texto
  (substring normalizado: sin acentos, minúsculas, espacios colapsados). Si
  no existe, la dimensión se pide de nuevo UNA vez; si sigue mal, queda
  marcada `evidencia_invalida = true`.
- Si el post pasa de 12.000 tokens se analiza por secciones y una llamada de
  síntesis consolida; si no, una sola llamada con el texto completo.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from . import prompts
from .llm import LLM
from .schemas import Analisis, ParrafoAfecto, subset_model
from .text import EvidenceIndex

LONG_TEXT_TOKENS = 12_000
SECTION_TOKENS = 8_000


@dataclass
class LiteraryResult:
    analisis: Analisis
    evidencia_invalida: dict[str, bool]
    referencias_invalidas: list[bool]
    imagenes_invalidas: list[bool]
    parrafos: list[ParrafoAfecto]
    secciones: int = 1
    reintentos: list[str] = field(default_factory=list)

    @property
    def campos_invalidos(self) -> list[str]:
        return [name for name, bad in self.evidencia_invalida.items() if bad]


def dimension_quotes(name: str, dim) -> list[str]:
    if name in ("eje_x", "eje_y"):
        return list(dim.evidencia)
    if name == "intertextualidad":
        return [r.evidencia for r in dim.referencias]
    if name == "figuracion":
        return [dim.evidencia] + [i.evidencia for i in dim.imagenes_recurrentes]
    if name == "afecto":
        return [dim.distancia_afectiva.evidencia] + list(dim.ironia.evidencia)
    return [dim.evidencia]


def invalid_dimensions(analisis, index: EvidenceIndex) -> list[str]:
    bad: list[str] = []
    for name in type(analisis).model_fields:
        dim = getattr(analisis, name)
        quotes = dimension_quotes(name, dim)
        if any(not index.contains(q) for q in quotes):
            bad.append(name)
        elif name == "afecto" and dim.ironia.valor and not dim.ironia.evidencia:
            bad.append(name)
    return bad


def _ask_with_evidence(llm: LLM, messages: list[dict], index: EvidenceIndex, retries: list[str]) -> Analisis:
    result, raw = llm.complete(messages, Analisis)
    invalid = invalid_dimensions(result, index)
    if invalid:
        retries.extend(invalid)
        partial, _ = llm.complete(
            messages + [{"role": "assistant", "content": raw}, {"role": "user", "content": prompts.user_retry(invalid)}],
            subset_model(invalid),
        )
        result = result.model_copy(update={name: getattr(partial, name) for name in invalid})
    return result


def _sections(paragraphs: list[tuple[int, str, int]]) -> list[list[tuple[int, str, int]]]:
    sections: list[list[tuple[int, str, int]]] = [[]]
    tokens = 0
    for p in paragraphs:
        if sections[-1] and tokens + p[2] > SECTION_TOKENS:
            sections.append([])
            tokens = 0
        sections[-1].append(p)
        tokens += p[2]
    return sections


def analyze(llm: LLM, title: str, body: str, paragraphs: list[tuple[int, str, int]]) -> LiteraryResult:
    """`paragraphs`: (idx, texto, tokens) de los párrafos ya fusionados."""
    index = EvidenceIndex(body)
    system = {"role": "system", "content": prompts.SYSTEM}
    retries: list[str] = []
    total_tokens = sum(p[2] for p in paragraphs)
    numbered = [(i, t) for i, t, _ in paragraphs]

    if total_tokens <= LONG_TEXT_TOKENS:
        final = _ask_with_evidence(llm, [system, {"role": "user", "content": prompts.user_full(title, numbered)}], index, retries)
        parrafos = list(final.afecto.parrafos)
        n_sections = 1
    else:
        sections = _sections(paragraphs)
        n_sections = len(sections)
        section_results: list[Analisis] = []
        parrafos = []
        for k, section in enumerate(sections, start=1):
            user = prompts.user_section(title, [(i, t) for i, t, _ in section], k, n_sections)
            res = _ask_with_evidence(llm, [system, {"role": "user", "content": user}], index, retries)
            section_results.append(res)
            parrafos.extend(res.afecto.parrafos)
        synthesis = prompts.user_synthesis(
            title,
            [r.model_dump_json(exclude={"afecto": {"parrafos"}}) for r in section_results],
            paragraphs[0][1],
            paragraphs[-1][1],
        )
        final = _ask_with_evidence(llm, [system, {"role": "user", "content": synthesis}], index, retries)

    # Un registro por párrafo conocido (el LLM a veces repite o inventa idx).
    known = {i for i, _, _ in paragraphs}
    by_idx: dict[int, ParrafoAfecto] = {}
    for p in parrafos:
        if p.idx in known and p.idx not in by_idx:
            by_idx[p.idx] = p
    final = final.model_copy(update={"afecto": final.afecto.model_copy(update={"parrafos": []})})

    invalid = set(invalid_dimensions(final, index))
    return LiteraryResult(
        analisis=final,
        evidencia_invalida={name: name in invalid for name in Analisis.model_fields},
        referencias_invalidas=[not index.contains(r.evidencia) for r in final.intertextualidad.referencias],
        imagenes_invalidas=[not index.contains(i.evidencia) for i in final.figuracion.imagenes_recurrentes],
        parrafos=[by_idx[i] for i in sorted(by_idx)],
        secciones=n_sections,
        reintentos=retries,
    )
