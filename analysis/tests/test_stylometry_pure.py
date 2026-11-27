from perpetuo_analysis.stylometry import DATE_RE, PERCENT_RE, mtld


def test_mtld_repetitive_text_is_low():
    repetitive = ("la casa la casa la casa " * 20).split()
    varied = "el sol caía sobre la plaza vieja mientras dos perros dormían bajo un banco de hierro pintado de verde".split() * 2
    assert mtld(repetitive) < mtld(varied)


def test_mtld_short_text_is_none():
    assert mtld(["uno", "dos"]) is None


def test_dates_and_percentages():
    text = "El 14 de marzo de 2019 llovió. En 2020, el 38 % no votó; en marzo de 2021, 12 por ciento."
    assert len(DATE_RE.findall(text)) == 3
    assert len(PERCENT_RE.findall(text)) == 2
