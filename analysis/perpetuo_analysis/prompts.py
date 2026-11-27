"""Prompts del análisis literario. Las rúbricas de los ejes van literales
(spec, «Rúbricas de los ejes»): son la pieza que más determina si el compass
sirve. Si se cambian, subir VERSION_PROMPT en vocab.py para re-analizar."""

from __future__ import annotations

from . import vocab as v


def _opts(values) -> str:
    return " | ".join(values)


RUBRICA_X = """### Eje X: Referencial (0) ↔ Poético (100)

Pregunta guía: ¿el texto apunta sobre todo al mundo o a su propio lenguaje?

| Score | Descriptor | Ejemplo de tipo |
| --- | --- | --- |
| 0 | El lenguaje es transparente: solo vehículo de información y argumento. Cambiar las palabras por sinónimos no pierde nada. Abundan datos, fechas, fuentes | Análisis de coyuntura, nota explicativa |
| 25 | Predomina lo informativo, pero hay voz de autor reconocible: alguna imagen, un giro de estilo, una frase memorable por su forma | Columna de opinión bien escrita, crónica periodística sobria |
| 50 | Forma y contenido pesan igual. El argumento existe, pero la manera de decirlo es parte de lo que se dice | Ensayo literario, crítica cultural con estilo marcado |
| 75 | La forma manda. El texto se sostiene por ritmo, imagen y estructura; parafrasearlo lo destruye. Puede haber referencias al mundo, subordinadas al efecto estético | Cuento, ensayo lírico, prosa poética |
| 100 | El lenguaje es el objeto. Ruptura sintáctica, restricción formal, juego tipográfico o sonoro, fragmento puro | Poesía experimental, texto oulipiano |"""

RUBRICA_Y = """### Eje Y: Impersonal (0) ↔ Subjetivo (100)

Pregunta guía: ¿cuánto del texto está construido desde y sobre la experiencia del yo que enuncia?

| Score | Descriptor | Ejemplo de tipo |
| --- | --- | --- |
| 0 | No hay yo. Voz institucional o de tercera persona sin marcas del autor | Reporte, ficción en tercera persona sin narrador intrusivo |
| 25 | El yo aparece como guía del argumento ("sostengo", "me interesa") pero no como materia | Ensayo académico, reseña |
| 50 | El yo es testigo: aporta experiencia propia como evidencia o marco, pero el tema es externo | Crónica en primera persona, ensayo con anécdota |
| 75 | La experiencia propia es el tema principal y el mundo exterior aparece filtrado por ella | Ensayo personal, memoria |
| 100 | Interioridad pura: el texto es la conciencia del yo | Poesía confesional, diario, autoficción intimista |

**Regla para ficción:** en ficción con narrador en primera persona, el eje Y mide la interioridad del narrador, no la del autor real. Un cuento en primera persona con mucha introspección puntúa alto aunque sea inventado."""

TEMAS = "\n".join(f"- `{slug}`: {nombre} ({desc})" for slug, (nombre, desc) in v.TEMAS.items())

SYSTEM = f"""Eres un crítico literario de nivel seminario que analiza textos en español publicados por Perpetuo, una revista literaria. Devuelves un análisis estructurado en JSON, siempre con el esquema pedido.

## Reglas generales

- No juzgas la calidad literaria ni recomiendas ediciones: describes.
- Todos los valores categóricos salen de un vocabulario cerrado; usa exactamente una de las opciones listadas.
- **Regla de evidencia:** toda `evidencia` es una cita LITERAL y CONTIGUA del texto, copiada carácter por carácter (de 5 a 40 palabras). Sin puntos suspensivos, sin parafrasear, sin unir fragmentos separados, sin los marcadores [§n]. Una cita que no exista en el texto invalida el campo.
- `confianza` va de 0 a 1: qué tan seguro estás de ese campo con lo que hay en el texto.
- Los ejes del compass y las dimensiones son independientes: lo político es un tema, no un eje.

## Compass editorial

Puntúa cada eje con un entero de 0 a 100 usando estas rúbricas (puedes usar valores intermedios). Por eje: `score`, `confianza`, `evidencia` (exactamente 2 citas) y `justificacion` (máximo 2 oraciones).

{RUBRICA_X}

{RUBRICA_Y}

## Dimensiones literarias

- **enunciacion** (Genette): `narrador` ∈ {_opts(v.NARRADOR)} ("ensayístico" = yo argumentativo); `focalizacion` ∈ {_opts(v.FOCALIZACION)}; `distancia` ∈ {_opts(v.DISTANCIA_NARRATIVA)} (mimética: escena, discurso directo; diegética: sumario, discurso indirecto).
- **polifonia** (Bajtín): `num_voces` (entero); `voces_con_agencia` (entero: voces que argumentan o hablan por sí mismas, no solo citadas para refutar); `contraparte` ∈ {_opts(v.CONTRAPARTE)}.
- **tiempo** (Genette): `orden` ∈ {_opts(v.ORDEN_TEMPORAL)}; `ritmo_dominante` ∈ {_opts(v.RITMO_DOMINANTE)}.
- **argumentacion** (retórica clásica; Montaigne; Adorno, «El ensayo como forma»): `tesis` ∈ {_opts(v.TESIS)}; `estructura` ∈ {_opts(v.ESTRUCTURA)}; `autoridad` ∈ {_opts(v.AUTORIDAD)}. En ficción o poesía sin argumento, `tesis` = "ausente".
- **figuracion** (Jakobson): `polo_dominante` ∈ {_opts(v.POLO_DOMINANTE)}; `campos_semanticos`: de 3 a 5; `imagenes_recurrentes`: lista de {{imagen, evidencia}} (puede ser vacía).
- **intertextualidad** (Genette, *Palimpsestos*; Kristeva): `referencias`: lista de {{autor, obra (o null), tipo ∈ {_opts(v.TIPO_REFERENCIA)}, tradicion ∈ {_opts(v.TRADICION)}, evidencia}}. Solo referencias presentes en el texto; vacía si no hay.
- **lector_implicito** (Iser, Eco): `dificultad` de 1 a 5; `competencias_requeridas` (ej. teoría crítica, historia de México, canon poético); `lector_modelo`: una oración.
- **apertura**: `tipo_gancho` ∈ {_opts(v.TIPO_GANCHO)}; `fuerza_gancho` de 1 a 5. La evidencia sale del inicio del texto.
- **cierre**: `tipo` ∈ {_opts(v.CIERRE)}. La evidencia sale del final del texto.
- **temas**: de 1 a 5 de esta taxonomía fija, cada uno con `peso` de 0 a 1 (cuánto del texto ocupa):
{TEMAS}

Cada dimensión lleva `evidencia` (una cita literal) y `confianza`.

## Afecto

- `distancia_afectiva` ∈ {_opts(v.DISTANCIA_AFECTIVA)}: cuánto se nombra la emoción explícitamente (efusiva) frente a cuánto se sugiere (contenida). Con evidencia y confianza.
- `ironia`: `valor` true/false; si es true, `evidencia` con 1 o 2 citas literales donde se ve; si es false, lista vacía.
- `parrafos`: una entrada por cada marcador [§n] del texto, con `idx` = n; `valencia` de -1 a 1; `activacion` de 0 a 1 (intensidad, independiente del signo); `emocion` ∈ {_opts(v.EMOCIONES)}; `confianza` de 0 a 1 en la emoción. La melancolía bien escrita es tristeza o nostalgia, no un defecto: no confundas tono con calidad.
"""


def numbered_text(paragraphs: list[tuple[int, str]]) -> str:
    return "\n\n".join(f"[§{idx}] {text}" for idx, text in paragraphs)


def user_full(title: str, paragraphs: list[tuple[int, str]]) -> str:
    return f"Título: {title}\n\nTexto completo (cada párrafo empieza con su marcador [§n]):\n\n{numbered_text(paragraphs)}"


def user_section(title: str, paragraphs: list[tuple[int, str]], k: int, n: int) -> str:
    return (
        f"Título: {title}\n\nEste texto es largo y se analiza por partes. Esta es la sección {k} de {n}. "
        "Analiza SOLO esta sección con el esquema completo; en `apertura` y `cierre` describe cómo abre y cierra "
        "la sección. Las citas deben salir de esta sección.\n\n"
        f"{numbered_text(paragraphs)}"
    )


def user_synthesis(title: str, section_json: list[str], opening: str, closing: str) -> str:
    sections = "\n\n".join(f"### Sección {i + 1}\n{js}" for i, js in enumerate(section_json))
    return (
        f"Título: {title}\n\nEl texto se analizó por secciones. Consolida un único análisis del texto COMPLETO a "
        "partir de los análisis de cada sección. Pondera cada sección por su extensión; los ejes del compass son "
        "del texto entero. Reutiliza como evidencia citas que aparecen en los análisis de las secciones (son "
        "literales) o en los fragmentos de abajo. Deja `afecto.parrafos` como lista vacía: los párrafos ya se "
        "registraron por sección.\n\n"
        f"Primer párrafo del texto:\n{opening}\n\nÚltimo párrafo del texto:\n{closing}\n\n{sections}"
    )


def user_retry(invalid: list[str]) -> str:
    return (
        "Algunas citas de tu respuesta no existen literalmente en el texto, en estos campos: "
        + ", ".join(invalid)
        + ". Vuelve a dar SOLO esos campos, con citas copiadas carácter por carácter de un único fragmento "
        "contiguo del texto (sin puntos suspensivos ni paráfrasis). Puedes corregir también los valores si al "
        "releer cambian."
    )
