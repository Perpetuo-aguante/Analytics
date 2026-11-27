"""Los vocabularios cerrados viven en vocab.py, pero se repiten en los check
de db/schema.sql y en las etiquetas de la app: estas pruebas evitan que se
desincronicen."""

import re
from pathlib import Path

from perpetuo_analysis import vocab as v
from perpetuo_analysis.schemas import Analisis, strict_json_schema

ROOT = Path(__file__).resolve().parents[2]
SCHEMA = (ROOT / "db" / "schema.sql").read_text()
TS = (ROOT / "src" / "lib" / "compass-vocab.ts").read_text()

COLUMNS = {
    "emocion_dominante": v.EMOCIONES,
    "arco": v.ARCOS,
    "distancia_afectiva": v.DISTANCIA_AFECTIVA,
    "narrador": v.NARRADOR,
    "focalizacion": v.FOCALIZACION,
    "distancia_narrativa": v.DISTANCIA_NARRATIVA,
    "contraparte": v.CONTRAPARTE,
    "orden_temporal": v.ORDEN_TEMPORAL,
    "ritmo_dominante": v.RITMO_DOMINANTE,
    "tesis": v.TESIS,
    "estructura": v.ESTRUCTURA,
    "autoridad": v.AUTORIDAD,
    "polo_dominante": v.POLO_DOMINANTE,
    "tipo": v.TIPO_REFERENCIA,
    "tradicion": v.TRADICION,
    "tipo_gancho": v.TIPO_GANCHO,
    "cierre": v.CIERRE,
}


def test_sql_checks_match_vocab():
    for column, values in COLUMNS.items():
        match = re.search(rf"check \({column} in \(([^)]*)\)\)", SCHEMA)
        assert match, column
        assert tuple(re.findall(r"'([^']*)'", match.group(1))) == values, column


def test_sql_seeds_theme_taxonomy():
    for slug in v.TEMAS:
        assert f"('{slug}'," in SCHEMA


def test_typescript_vocab_matches():
    for column, values in COLUMNS.items():
        match = re.search(rf"^  {column}: \[([^\]]*)\]", TS, re.M)
        assert match, column
        assert tuple(re.findall(r'"([^"]*)"', match.group(1))) == values, column
    for slug in v.TEMAS:
        assert f'"{slug}"' in TS


def test_strict_schema_closes_every_object():
    schema = strict_json_schema(Analisis)

    def walk(node):
        if isinstance(node, dict):
            if node.get("type") == "object" and "properties" in node:
                assert node["additionalProperties"] is False
                assert set(node["required"]) == set(node["properties"])
            assert "minimum" not in node and "maxItems" not in node
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for item in node:
                walk(item)

    walk(schema)
