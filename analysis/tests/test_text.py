from perpetuo_analysis.text import EvidenceIndex, Span, merge_short, normalize_for_match, raw_paragraphs


def test_raw_paragraphs_blank_lines():
    body = "Uno dos.\n\nTres cuatro.\n  \nCinco."
    spans = raw_paragraphs(body)
    assert [s.text(body) for s in spans] == ["Uno dos.", "Tres cuatro.", "Cinco."]


def test_raw_paragraphs_single_newlines_when_no_blank_lines():
    body = "Uno.\nDos.\nTres."
    assert [s.text(body) for s in raw_paragraphs(body)] == ["Uno.", "Dos.", "Tres."]


def test_merge_short_joins_with_next_and_last_with_previous():
    spans = [Span(0, 5), Span(6, 10), Span(11, 20), Span(21, 25)]
    merged = merge_short(spans, [3, 20, 30, 4], minimum=15)
    assert merged == [(Span(0, 10), 23), (Span(11, 25), 34)]


def test_merge_short_all_short():
    assert merge_short([Span(0, 3), Span(4, 6)], [2, 2]) == [(Span(0, 6), 4)]


def test_normalize_for_match():
    assert normalize_for_match("  «Él   CANTÓ»\n") == '"el canto"'


def test_evidence_index():
    index = EvidenceIndex("La casa, decía mi abuela, «tose cuando llueve».")
    assert index.contains("decia mi  abuela")
    assert index.contains('"tose cuando llueve"')
    assert not index.contains("la casa respira")
    assert not index.contains("")
