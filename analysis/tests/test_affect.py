import math

from perpetuo_analysis.affect import Paragraph, aggregate, classify_arc, smooth
from perpetuo_analysis.text import Span


def test_smooth_edges():
    assert smooth([0, 3, 6]) == [1.5, 3, 4.5]


def test_short_posts_have_no_arc():
    assert classify_arc([0.1, 0.2, 0.3, 0.4, 0.5]) == (None, None)


def test_flat_curve_has_no_arc():
    assert classify_arc([0.2] * 8) == (None, None)


def _curve(f, n=12):
    return [f(i / (n - 1)) for i in range(n)]


def test_six_shapes():
    cases = {
        "ascenso": lambda t: t,
        "caída": lambda t: 1 - t,
        "caída-ascenso": lambda t: -math.sin(math.pi * t),
        "ascenso-caída": lambda t: math.sin(math.pi * t),
        "ascenso-caída-ascenso": lambda t: -math.cos(3 * math.pi * t),
        "caída-ascenso-caída": lambda t: math.cos(3 * math.pi * t),
    }
    for name, f in cases.items():
        arc, fit = classify_arc(_curve(f, 18))
        assert arc == name, (name, arc)
        assert fit > 0.8


def test_emotion_winner_and_aggregate():
    p = Paragraph(0, Span(0, 1), 20, valencia_baseline=-0.5, emocion_baseline="tristeza", emocion_baseline_conf=0.6,
                  emocion_llm="nostalgia", emocion_llm_conf=0.8, activacion=0.4)
    assert (p.emocion_dominante, p.emocion_fuente) == ("nostalgia", "llm")
    q = Paragraph(1, Span(0, 1), 20, valencia_baseline=0.5, emocion_baseline="alegría", emocion_baseline_conf=0.9,
                  emocion_llm="ternura", emocion_llm_conf=0.7)
    assert (q.emocion_dominante, q.emocion_fuente) == ("alegría", "baseline")
    agg = aggregate([p, q])
    assert agg.arco is None and agg.valencia_media == 0 and agg.rango_valencia == 1 and agg.activacion_media == 0.4
