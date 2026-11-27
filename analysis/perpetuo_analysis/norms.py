"""Normalización de la estilometría: media y desviación de cada feature
sobre el corpus completo (stylometry_norms). Los z-scores se calculan al
leer. Se recalculan cuando el corpus crece más de 10% desde la última vez."""

from __future__ import annotations

from .stylometry import FEATURES

GROWTH_THRESHOLD = 0.10


def needs_refresh(conn) -> bool:
    count = conn.execute("select count(*) as n from post_stylometry").fetchone()["n"]
    row = conn.execute("select min(corpus_size) as size from stylometry_norms").fetchone()
    size = row["size"] if row else None
    if count == 0:
        return False
    return size is None or count > size * (1 + GROWTH_THRESHOLD)


def refresh(conn) -> int:
    columns = ", ".join(
        f"avg({f}) as {f}_media, stddev_pop({f}) as {f}_desv" for f in FEATURES
    )
    stats = conn.execute(f"select count(*) as n, {columns} from post_stylometry").fetchone()
    for f in FEATURES:
        media, desv = stats[f"{f}_media"], stats[f"{f}_desv"]
        if media is None:
            continue
        conn.execute(
            """insert into stylometry_norms (feature, media, desviacion, corpus_size, computed_at)
               values (%s, %s, %s, %s, now())
               on conflict (feature) do update set media = excluded.media, desviacion = excluded.desviacion,
                 corpus_size = excluded.corpus_size, computed_at = now()""",
            (f, media, desv or 0, stats["n"]),
        )
    return stats["n"]
