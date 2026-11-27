"""Acceso a Postgres (Neon) desde el worker. Usa DATABASE_URL (la misma de
la app); se leen .env.local y .env de la raíz del repo si existen."""

from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def _load_env_files() -> None:
    for name in (".env.local", ".env"):
        path = ROOT / name
        if not path.exists():
            continue
        for line in path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def connect():
    import psycopg
    from psycopg.rows import dict_row

    _load_env_files()
    url = os.environ.get("DATABASE_URL_UNPOOLED") or os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("Falta DATABASE_URL (o DATABASE_URL_UNPOOLED).")
    return psycopg.connect(url, row_factory=dict_row, autocommit=False)
