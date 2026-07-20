# -*- coding: utf-8 -*-
"""
Une y limpia las dos exportaciones de la encuesta de suscriptores de Perpetuo
(Typeform + Google Forms), normaliza respuestas abiertas y produce:
  - unified.json    : tabla por encuestado (anonimizada: solo nombre de pila)
  - aggregate.json  : conteos por pregunta, listos para graficar
Además imprime totales y cross-tabs para construir las personas.

Uso: python3 analyze_survey.py <typeform.csv> <googleforms.csv> <outdir>
"""
import csv
import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict

TYPEFORM, GFORMS, OUTDIR = sys.argv[1], sys.argv[2], sys.argv[3]

EXCLUDE_EMAILS = {"jl@perpetuo.lat", "alonso.millet99@gmail.com", "tomaso@gmail.com"}

CONTENT_TYPES = ["Crónica", "Ensayos", "Poesía", "Reseñas",
                 "Escritura creativa", "Opinión", "Podcast", "Fotografía"]


def norm(s):
    return (s or "").strip()


def fold(s):
    s = unicodedata.normalize("NFD", (s or "").lower().strip())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


# ---------------- país ----------------
COUNTRY_MAP = {
    "mexico": "México", "mèxico": "México", "mx": "México", "eua": "Estados Unidos",
    "estados unidos": "Estados Unidos", "colombia": "Colombia", "uruguay": "Uruguay",
    "espana": "España", "argentina": "Argentina", "peru": "Perú", "chile": "Chile",
    "el salvador": "El Salvador", "costa rica": "Costa Rica", "ecuador": "Ecuador",
}
CITY_TO_COUNTRY = [
    ("peru", "Perú"), ("colombia", "Colombia"), ("costa rica", "Costa Rica"),
    ("chile", "Chile"), ("ecuador", "Ecuador"), ("yucatan", "México"),
    ("cozumel", "México"), ("cdmx", "México"), ("ciudad de mexico", "México"),
    ("guadalajara", "México"), ("monterrey", "México"), ("noreste", "México"),
    ("merida", "México"), ("valencia", "España"), ("madrid", "España"),
    ("medellin", "Colombia"), ("bogota", "Colombia"), ("manizales", "Colombia"),
    ("cali", "Colombia"), ("neza", "México"), ("chicago", "Estados Unidos"),
    ("nueva york", "Estados Unidos"), ("philadelphia", "Estados Unidos"),
    ("san francisco", "Estados Unidos"), ("texas", "Estados Unidos"),
]


def norm_country(pais, ciudad):
    p = fold(pais)
    if p in COUNTRY_MAP:
        return COUNTRY_MAP[p]
    if p:
        return norm(pais)
    c = fold(ciudad)
    for key, country in CITY_TO_COUNTRY:
        if key in c:
            return country
    return "Sin dato"


# ---------------- profesión ----------------
# Mapeo explícito por cadena exacta (folded). Revisado a mano contra los CSV.
PROF_MAP = {
    "cultura": "Arte, cultura y audiovisual",
    "estudiante": "Estudiante",
    "estudiante universitaria": "Estudiante",
    "docente universitario": "Educación y academia",
    "audiovisual": "Arte, cultura y audiovisual",
    "medios audiovisuales": "Arte, cultura y audiovisual",
    "guionista/productor": "Arte, cultura y audiovisual",
    "creativo": "Arte, cultura y audiovisual",
    "diseno": "Arte, cultura y audiovisual",
    "publicista y gestora cultural": "Arte, cultura y audiovisual",
    "ingieniero": "Tecnología e ingeniería",
    "ingeniero": "Tecnología e ingeniería",
    "tecnologia": "Tecnología e ingeniería",
    "ciencia de datos": "Tecnología e ingeniería",
    "product manager en tecnologia/finanzas": "Tecnología e ingeniería",
    "docente": "Educación y academia",
    "docencia": "Educación y academia",
    "docente, ghostwriter, escritora.": "Educación y academia",
    "profesor de ingles": "Educación y academia",
    "profesor": "Educación y academia",
    "educacion": "Educación y academia",
    "educacion especial": "Educación y academia",
    "investigadora autonoma y autogestiva": "Educación y academia",
    "investigadora": "Educación y academia",
    "investigador, maestro": "Educación y academia",
    "academia y periodismo (medios)": "Educación y academia",
    "antropologo profesional y musico empirico": "Educación y academia",
    "biblioteca": "Educación y academia",
    "abogada": "Negocios, legal y finanzas",
    "legal": "Negocios, legal y finanzas",
    "finanzas": "Negocios, legal y finanzas",
    "sector financiero": "Negocios, legal y finanzas",
    "economista": "Negocios, legal y finanzas",
    "administradora de condominios": "Negocios, legal y finanzas",
    "management consulting": "Negocios, legal y finanzas",
    "marketing digital": "Negocios, legal y finanzas",
    "marketing": "Negocios, legal y finanzas",
    "pr": "Negocios, legal y finanzas",
    "project coordinator": "Negocios, legal y finanzas",
    "analista": "Negocios, legal y finanzas",
    "alimentos": "Negocios, legal y finanzas",
    "analista internacional y periodista freelance": "Periodismo y medios",
    "redactora y periodista digital": "Periodismo y medios",
    "periodista": "Periodismo y medios",
    "periodismo": "Periodismo y medios",
    "redactora, editora, correctora de estilo; estudiante": "Escritura y editorial",
    "autora": "Escritura y editorial",
    "editorial": "Escritura y editorial",
    "literary scouting": "Escritura y editorial",
    "escritora y terapeuta manual": "Escritura y editorial",
    "medica, sexologa": "Salud",
    "sector salud": "Salud",
    "consultor independente para ong's en donantes individuales": "ONG y filantropía",
    "filantropia": "ONG y filantropía",
    "ong": "ONG y filantropía",
    "pensionado": "Jubilado/pensionado",
    "jubilado. antes avisor de politica en el gobierno canadiense": "Jubilado/pensionado",
    "pensionista, estudios de literatura inconclusos en unmsm": "Jubilado/pensionado",
    "instructora de defensa personal": "Otro",
    "interprete": "Otro",
    "chief of staff": "Otro",
}


def norm_prof(raw):
    r = fold(raw)
    if not r:
        return "Sin dato"
    if r in PROF_MAP:
        return PROF_MAP[r]
    return "__UNMAPPED__:" + raw


# ---------------- revistas ----------------
# (patrón folded, nombre canónico, idioma principal)
MAG_PATTERNS = [
    ("new yorker", "The New Yorker", "en"),
    ("nyt", "The New York Times", "en"),
    ("new york times", "The New York Times", "en"),
    ("el taims", "The New York Times", "en"),
    ("atlantic", "The Atlantic", "en"),
    ("wsj", "The Wall Street Journal", "en"),
    ("el pais", "El País (y Babelia)", "es"),
    ("babelia", "El País (y Babelia)", "es"),
    ("letras libres", "Letras Libres", "es"),
    ("lettras libres", "Letras Libres", "es"),
    ("nexos", "Nexos", "es"),
    ("gatopardo", "Gatopardo", "es"),
    ("orsai", "Orsai", "es"),
    ("national geographic", "National Geographic", "es"),
    ("natgeo", "National Geographic", "es"),
    ("substack", "Newsletters de Substack", "es"),
    ("substrack", "Newsletters de Substack", "es"),
    ("newsletter", "Newsletters de Substack", "es"),
    ("proceso", "Proceso", "es"),
    ("reforma", "Reforma", "es"),
    ("this pais", "Este País", "es"),
    ("este pais", "Este País", "es"),
    ("harvard magazine", "Harvard Magazine", "en"),
    ("ft", "Financial Times", "en"),
    ("the culturist", "The Culturist", "en"),
    ("marginalian", "The Marginalian", "en"),
    ("the athletic", "The Athletic", "en"),
    ("wired", "WIRED", "en"),
    ("time,", "Time", "en"),
    ("pitchfork", "Pitchfork", "en"),
    ("jama", "JAMA", "en"),
    ("forbes", "Forbes", "es"),
    ("el malpensante", "El Malpensante", "es"),
    ("anfibia", "Anfibia", "es"),
    ("5w", "5W", "es"),
    ("revista de la universidad", "Revista de la Universidad", "es"),
    ("el espectador", "El Espectador", "es"),
    ("el cultural", "El Cultural", "es"),
    ("mexico decoded", "Mexico Decoded", "en"),
    ("roots of progress", "The Roots of Progress", "en"),
    ("poetic outlaws", "Poetic Outlaws", "en"),
    ("core memory", "Core Memory", "en"),
    ("whitepaper", "Whitepaper", "en"),
    ("arena magazine", "Arena Magazine", "en"),
    ("bbc", "BBC (Culture/Travel/Future)", "en"),
    ("muy historia", "Muy Historia", "es"),
    ("the objective", "The Objective", "es"),
    ("mediapart", "MediaPart", "fr"),
    ("panenka", "Panenka", "es"),
    ("librujula", "Librújula", "es"),
    ("wmagazine", "W Magazine", "en"),
]
NONE_PATTERNS = ["ninguna", "ninguno", "^na$", "^no$", "no lo recuerdo", "^2$",
                 "de momento solo a perpetuo", "^\\.$", "^\\*\\*$"]


def parse_mags(raw):
    """-> (lista canónica, lee_en_ingles, sin_otras)"""
    r = fold(raw)
    found, langs = [], set()
    for pat, name, lang in MAG_PATTERNS:
        if pat in r and name not in found:
            found.append(name)
            langs.add(lang)
    if not found:
        if not r or any(re.search(p, r) for p in NONE_PATTERNS):
            return [], False, True
        return ["Otras (una mención)"], False, False
    return found, ("en" in langs), False


# ---------------- deseos / eventos ----------------
WISH_THEMES = [
    ("Concursos y convocatorias", ["concurso", "convocatoria", "certamen", "mundial"]),
    ("Talleres, becas y residencias", ["taller", "beca", "residencia", "estancia",
                                      "retiro", "curso", "circulos de estudio", "empleo"]),
    ("Encuentros con autores y lectores", ["encuentro", "meetup", "club", "tertulia",
                                           "charla", "conversa", "cafe", "vino",
                                           "reunion", "conectar", "conocer", "entrevista",
                                           "q&a", "sesiones virtuales", "webinar",
                                           "meet your writer", "contacto lector",
                                           "colaboraciones con suscriptores", "recitales"]),
    ("Presentaciones y eventos culturales", ["presentacion", "exposicion", "obra de teatro",
                                             "conferencia", "peliculas", "giveaway",
                                             "eventos literarios", "eventos de cronica"]),
    ("Publicar en Perpetuo", ["publicar", "escribir con ustedes", "recepcion de textos",
                              "escritura creativa", "columnas de escritores", "fanzine",
                              "creaciones colectivas"]),
    ("Podcast", ["podcast"]),
    ("Merch y otros formatos", ["merch", "impreso"]),
]


def parse_wishes(*texts):
    r = fold(" | ".join(t for t in texts if t))
    return [theme for theme, keys in WISH_THEMES if any(k in r for k in keys)]


def norm_age(a):
    a = norm(a)
    return "65+" if a in ("65 o más", "65+") else (a or "Sin dato")


def make_record(**kw):
    rec = dict(kw)
    rec["pais_norm"] = norm_country(rec["pais"], rec["ciudad"])
    rec["prof_norm"] = norm_prof(rec["profesion"])
    mags, en, none = parse_mags(rec["revistas"])
    rec["revistas_norm"], rec["lee_en_ingles"], rec["sin_otras"] = mags, en, none
    rec["deseos"] = parse_wishes(rec.get("eventos", ""), rec.get("beneficios", ""))
    rec["edad"] = norm_age(rec["edad"])
    return rec


# ---------------- carga Typeform ----------------
records = []
with open(TYPEFORM, newline="", encoding="utf-8") as f:
    rows = list(csv.reader(f))
header, rows = rows[0], rows[1:]
tf_total = len(rows)
for row in rows:
    email = fold(row[3])
    if email in EXCLUDE_EMAILS:
        continue
    contenido = [c for c, cell in zip(CONTENT_TYPES, row[20:28]) if norm(cell)]
    records.append(make_record(
        fuente="typeform", nombre=norm(row[1]), email=email, edad=row[4],
        genero=norm(row[5]) or "Sin dato", pais=row[6], ciudad=row[7],
        esp_nativo={"1": "Sí", "0": "No"}.get(norm(row[8]), "Sin dato"),
        educacion=norm(row[11]) or "Sin dato", profesion=norm(row[12]),
        frecuencia=norm(row[13]) or None, revistas=row[16],
        tipo_suscriptor=norm(row[17]) or None, satisfaccion=norm(row[18]) or None,
        beneficios=row[19], contenido=contenido, eventos=row[28],
        nps=int(row[29]) if norm(row[29]) else None, comentarios=norm(row[30]),
    ))

# ---------------- carga Google Forms ----------------
gf_records = []
with open(GFORMS, newline="", encoding="utf-8") as f:
    rows = list(csv.reader(f))
gf_total = len(rows) - 1
for row in rows[1:]:
    email = fold(row[2])
    if email in EXCLUDE_EMAILS:
        continue
    gf_records.append(make_record(
        fuente="gforms", nombre=norm(row[1]).split()[0] if norm(row[1]) else "",
        email=email, edad=row[3], genero=norm(row[4]) or "Sin dato",
        pais=row[5], ciudad=row[6], esp_nativo=norm(row[7]) or "Sin dato",
        educacion=norm(row[8]) or "Sin dato", profesion=norm(row[9]),
        frecuencia=None, revistas=row[10], tipo_suscriptor=None, satisfaccion=None,
        beneficios="", contenido=[norm(row[11])] if norm(row[11]) else [],
        eventos=row[12], nps=int(row[13]) if norm(row[13]) else None,
        comentarios=norm(row[14]),
    ))

# ---------------- dedupe entre formularios ----------------
def name_key(r):
    return fold(r["nombre"].split()[0] if r["nombre"] else "") + "|" + fold(r.get("apellido", ""))

tf_by_email = {r["email"]: r for r in records}
tf_first_names = {fold(r["nombre"]): r for r in records}
DUP_NAME_KEYS = {"natasha"}  # Natasha Nuñez: emails distintos en cada formulario

deduped_dupes = []
for g in gf_records:
    first = fold(g["nombre"])
    tf_match = tf_by_email.get(g["email"]) or (
        tf_first_names.get(first) if first in DUP_NAME_KEYS else None)
    if tf_match:
        deduped_dupes.append((g["nombre"], g["email"]))
        # backfill: campos que solo trae Forms
        for field in ("profesion", "revistas", "eventos", "comentarios"):
            if norm(g[field]) and not norm(tf_match[field] or ""):
                tf_match[field] = g[field]
        tf_match["prof_norm"] = norm_prof(tf_match["profesion"])
        mags, en, none = parse_mags(tf_match["revistas"])
        tf_match["revistas_norm"], tf_match["lee_en_ingles"], tf_match["sin_otras"] = mags, en, none
        tf_match["deseos"] = parse_wishes(tf_match.get("eventos", ""),
                                          tf_match.get("beneficios", ""))
        continue
    records.append(g)

# quitar apellidos: solo nombre de pila en el output
for r in records:
    r["nombre"] = r["nombre"].split()[0].title() if r["nombre"] else ""
    del r["email"]

unmapped = sorted({r["prof_norm"] for r in records if r["prof_norm"].startswith("__UNMAPPED__")})
if unmapped:
    print("!! PROFESIONES SIN MAPEAR:")
    for u in unmapped:
        print("   ", u)

n = len(records)
n_excluded = tf_total + gf_total - n - len(deduped_dupes)
print(f"Typeform filas: {tf_total} | GForms filas: {gf_total}")
print(f"Excluidos (test/equipo): {n_excluded}")
print(f"Duplicados entre formularios fusionados: {deduped_dupes}")
print(f"Únicos finales: {n}")


def count(field, records=records):
    return Counter(r[field] for r in records if r.get(field))


def count_list(field, records=records):
    c = Counter()
    for r in records:
        c.update(r.get(field) or [])
    return c


def nps_stats(recs):
    scores = [r["nps"] for r in recs if r["nps"] is not None]
    if not scores:
        return None
    prom = sum(1 for s in scores if s >= 9)
    det = sum(1 for s in scores if s <= 6)
    return {"n": len(scores), "promedio": round(sum(scores) / len(scores), 1),
            "promotores": prom, "pasivos": len(scores) - prom - det, "detractores": det,
            "nps": round(100 * (prom - det) / len(scores)),
            "dist": dict(Counter(scores))}


tf_recs = [r for r in records if r["fuente"] == "typeform"]

aggregate = {
    "totales": {"typeform": tf_total, "gforms": gf_total, "excluidos": n_excluded,
                "duplicados": len(deduped_dupes), "unicos": n},
    "pais": dict(count("pais_norm").most_common()),
    "edad": dict(count("edad")),
    "genero": dict(count("genero")),
    "educacion": dict(count("educacion")),
    "esp_nativo": dict(count("esp_nativo")),
    "profesion": dict(count("prof_norm").most_common()),
    "frecuencia": dict(count("frecuencia", tf_recs)),
    "tipo_suscriptor": dict(count("tipo_suscriptor", tf_recs)),
    "satisfaccion": dict(count("satisfaccion", tf_recs)),
    "contenido": dict(count_list("contenido").most_common()),
    "revistas": dict(count_list("revistas_norm").most_common()),
    "lee_en_ingles": sum(1 for r in records if r["lee_en_ingles"]),
    "sin_otras": sum(1 for r in records if r["sin_otras"]),
    "deseos": dict(count_list("deseos").most_common()),
    "nps": nps_stats(records),
}

with open(f"{OUTDIR}/aggregate.json", "w", encoding="utf-8") as f:
    json.dump(aggregate, f, ensure_ascii=False, indent=1)
with open(f"{OUTDIR}/unified.json", "w", encoding="utf-8") as f:
    json.dump(records, f, ensure_ascii=False, indent=1)

print(json.dumps(aggregate, ensure_ascii=False, indent=1))

# ---------------- cross-tabs para personas ----------------
CLUSTERS = {
    "Academia y educación": {"Educación y academia"},
    "Periodismo, escritura y cultura": {"Periodismo y medios", "Escritura y editorial",
                                        "Arte, cultura y audiovisual"},
    "Profesional (tec/negocios/ONG)": {"Tecnología e ingeniería", "Negocios, legal y finanzas",
                                       "ONG y filantropía"},
    "Resto": {"Salud", "Estudiante", "Jubilado/pensionado", "Otro", "Sin dato"},
}
print("\n===== CROSS-TABS POR CLUSTER =====")
for cname, cats in CLUSTERS.items():
    sub = [r for r in records if r["prof_norm"] in cats]
    if not sub:
        continue
    print(f"\n--- {cname} (n={len(sub)}, {round(100*len(sub)/n)}%) ---")
    print("  edad:", dict(count("edad", sub).most_common()))
    print("  país:", dict(count("pais_norm", sub).most_common()))
    print("  esp nativo:", dict(count("esp_nativo", sub)))
    print("  educación:", dict(count("educacion", sub).most_common()))
    print("  tipo suscriptor:", dict(count("tipo_suscriptor", sub)))
    print("  frecuencia:", dict(count("frecuencia", sub).most_common()))
    print("  lee en inglés:", sum(1 for r in sub if r["lee_en_ingles"]),
          "| sin otras suscripciones:", sum(1 for r in sub if r["sin_otras"]))
    print("  revistas:", dict(count_list("revistas_norm", sub).most_common(8)))
    print("  contenido:", dict(count_list("contenido", sub).most_common()))
    print("  deseos:", dict(count_list("deseos", sub).most_common()))
    st = nps_stats(sub)
    print("  NPS:", st and {k: st[k] for k in ("n", "promedio", "nps")})
    print("  gente:", [(r["nombre"], r["profesion"][:30], r["pais_norm"]) for r in sub])
