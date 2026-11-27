"""Vocabularios cerrados del análisis (spec «Compass editorial», capa 2 y 3).

Es la fuente de verdad: el esquema JSON que se le pide al LLM, la validación de
su respuesta, los `check` de db/schema.sql y las etiquetas de la app
(src/lib/compass-vocab.ts) tienen que coincidir con esto. tests/test_vocab.py
verifica que el SQL y el TypeScript no se desincronicen.
"""

# ── Capa 2: afecto ──────────────────────────────────────────────────────────
EMOCIONES = (
    "alegría", "tristeza", "ira", "miedo", "sorpresa", "asco",
    "nostalgia", "asombro", "ternura", "neutra",
)
# Las seis formas de Reagan et al. (2016), "The emotional arcs of stories are
# dominated by six basic shapes".
ARCOS = (
    "ascenso", "caída", "caída-ascenso", "ascenso-caída",
    "ascenso-caída-ascenso", "caída-ascenso-caída",
)
DISTANCIA_AFECTIVA = ("contenida", "moderada", "efusiva")

# ── Capa 3: análisis literario ──────────────────────────────────────────────
NARRADOR = ("homodiegético", "autodiegético", "heterodiegético", "ensayístico", "impersonal")
FOCALIZACION = ("cero", "interna", "externa", "variable")
DISTANCIA_NARRATIVA = ("mimética", "diegética", "mixta")
CONTRAPARTE = ("ausente", "hombre de paja", "representada con justicia")
ORDEN_TEMPORAL = ("lineal", "analepsis", "prolepsis", "fragmentario")
RITMO_DOMINANTE = ("escena", "sumario", "pausa descriptiva", "elipsis")
TESIS = ("explícita al inicio", "explícita al final", "implícita", "ausente")
ESTRUCTURA = ("deductiva", "inductiva", "dialéctica", "ensayo-paseo", "acumulativa")
AUTORIDAD = ("ninguna", "citas de apoyo", "citas en diálogo crítico")
POLO_DOMINANTE = ("metafórico", "metonímico", "equilibrado")
TIPO_REFERENCIA = ("cita", "alusión", "parodia", "epígrafe")
TRADICION = ("latinoamericana", "española", "europea", "anglo", "clásica", "otra")
TIPO_GANCHO = (
    "escena in medias res", "pregunta", "tesis provocadora", "anécdota",
    "dato", "cita", "imagen", "contexto expositivo",
)
CIERRE = ("abierto", "cerrado", "epifánico", "remate irónico", "circular", "llamado a la acción")

# ── Taxonomía fija de temas ─────────────────────────────────────────────────
# PROVISIONAL: el spec remite a una sección «Supuestos» con la taxonomía que no
# venía en el documento. Esta lista es un primer borrador pensado para el
# corpus de Perpetuo; se edita aquí (y en db/schema.sql, que la siembra).
# Lo político vive aquí, no en los ejes del compass.
TEMAS: dict[str, tuple[str, str]] = {
    # slug: (nombre, descripción que ve el LLM)
    "politica-poder": ("Política y poder", "gobierno, Estado, elecciones, partidos, poder público"),
    "violencia": ("Violencia", "crimen, narco, guerra, desaparición, violencia de Estado o doméstica"),
    "justicia-derechos": ("Justicia y derechos", "derechos humanos, leyes, impunidad, activismo"),
    "migracion-frontera": ("Migración y frontera", "migrar, exilio, frontera, diáspora"),
    "ciudad-territorio": ("Ciudad y territorio", "la ciudad, el barrio, el paisaje, el lugar"),
    "memoria-historia": ("Memoria e historia", "pasado colectivo, archivo, historia nacional"),
    "familia": ("Familia", "padres, hijos, herencia, crianza, linaje"),
    "amor-deseo": ("Amor y deseo", "pareja, erotismo, enamoramiento, ruptura"),
    "duelo-muerte": ("Duelo y muerte", "pérdida, muerte, enfermedad terminal, luto"),
    "cuerpo-salud": ("Cuerpo y salud", "cuerpo, enfermedad, salud mental, envejecimiento"),
    "identidad-genero": ("Identidad y género", "género, sexualidad, raza, clase como identidad"),
    "infancia": ("Infancia", "niñez, adolescencia, formación"),
    "trabajo-economia": ("Trabajo y economía", "dinero, empleo, precariedad, clase, consumo"),
    "tecnologia": ("Tecnología", "internet, redes, inteligencia artificial, ciencia aplicada"),
    "naturaleza-ambiente": ("Naturaleza y ambiente", "animales, ecología, crisis climática"),
    "fe-espiritualidad": ("Fe y espiritualidad", "religión, lo sagrado, ritual, mística"),
    "literatura-escritura": ("Literatura y escritura", "leer, escribir, libros, el oficio, la lengua"),
    "arte-cultura": ("Arte y cultura", "artes visuales, cine, música, teatro, cultura popular"),
    "filosofia-ideas": ("Filosofía e ideas", "pensamiento, ética, conceptos, teoría"),
    "viaje": ("Viaje", "viajar, desplazamiento, extranjería"),
    "comida": ("Comida", "cocina, alimentación, sobremesa"),
    "deporte-juego": ("Deporte y juego", "deporte, futbol, juego, competencia"),
}

# Versión de las reglas de cada capa. Subirla hace que el worker vuelva a
# analizar los posts ya procesados con una versión anterior.
VERSION_ESTILOMETRIA = "1"
VERSION_AFECTO = "1"
VERSION_PROMPT = "1"
