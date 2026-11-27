"""Forma exacta de la respuesta del LLM (capa 3 y la parte LLM de la capa 2).

Todos los valores categóricos son de vocabulario cerrado (vocab.py): sin eso
no se puede agregar ni graficar. Pydantic valida la respuesta; el mismo
modelo genera el esquema JSON que se le pide al LLM (salida estructurada).
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, create_model

from . import vocab as v


class _Base(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Eje(_Base):
    score: int = Field(ge=0, le=100, description="Entero de 0 a 100 según la rúbrica del eje.")
    confianza: float = Field(ge=0, le=1)
    evidencia: list[str] = Field(min_length=2, max_length=2, description="Exactamente 2 citas literales del texto.")
    justificacion: str = Field(description="Máximo 2 oraciones.")


class Enunciacion(_Base):
    narrador: Literal[v.NARRADOR]
    focalizacion: Literal[v.FOCALIZACION]
    distancia: Literal[v.DISTANCIA_NARRATIVA]
    evidencia: str
    confianza: float = Field(ge=0, le=1)


class Polifonia(_Base):
    num_voces: int = Field(ge=0)
    voces_con_agencia: int = Field(ge=0)
    contraparte: Literal[v.CONTRAPARTE]
    evidencia: str
    confianza: float = Field(ge=0, le=1)


class Tiempo(_Base):
    orden: Literal[v.ORDEN_TEMPORAL]
    ritmo_dominante: Literal[v.RITMO_DOMINANTE]
    evidencia: str
    confianza: float = Field(ge=0, le=1)


class Argumentacion(_Base):
    tesis: Literal[v.TESIS]
    estructura: Literal[v.ESTRUCTURA]
    autoridad: Literal[v.AUTORIDAD]
    evidencia: str
    confianza: float = Field(ge=0, le=1)


class Imagen(_Base):
    imagen: str
    evidencia: str


class Figuracion(_Base):
    polo_dominante: Literal[v.POLO_DOMINANTE]
    campos_semanticos: list[str] = Field(min_length=3, max_length=5)
    imagenes_recurrentes: list[Imagen]
    evidencia: str
    confianza: float = Field(ge=0, le=1)


class Referencia(_Base):
    autor: str
    obra: str | None
    tipo: Literal[v.TIPO_REFERENCIA]
    tradicion: Literal[v.TRADICION]
    evidencia: str


class Intertextualidad(_Base):
    referencias: list[Referencia]
    confianza: float = Field(ge=0, le=1)


class LectorImplicito(_Base):
    dificultad: int = Field(ge=1, le=5)
    competencias_requeridas: list[str]
    lector_modelo: str = Field(description="Una oración.")
    evidencia: str
    confianza: float = Field(ge=0, le=1)


class Apertura(_Base):
    tipo_gancho: Literal[v.TIPO_GANCHO]
    fuerza_gancho: int = Field(ge=1, le=5)
    evidencia: str
    confianza: float = Field(ge=0, le=1)


class Cierre(_Base):
    tipo: Literal[v.CIERRE]
    evidencia: str
    confianza: float = Field(ge=0, le=1)


class Tema(_Base):
    tema: Literal[tuple(v.TEMAS)]
    peso: float = Field(ge=0, le=1)


class Temas(_Base):
    temas: list[Tema] = Field(min_length=1, max_length=5)
    evidencia: str
    confianza: float = Field(ge=0, le=1)


class ParrafoAfecto(_Base):
    idx: int = Field(ge=0, description="El número del marcador [§n] del párrafo.")
    valencia: float = Field(ge=-1, le=1)
    activacion: float = Field(ge=0, le=1)
    emocion: Literal[v.EMOCIONES]
    confianza: float = Field(ge=0, le=1)


class DistanciaAfectiva(_Base):
    valor: Literal[v.DISTANCIA_AFECTIVA]
    evidencia: str
    confianza: float = Field(ge=0, le=1)


class Ironia(_Base):
    valor: bool
    evidencia: list[str] = Field(description="Citas literales; vacía si valor es false.")
    confianza: float = Field(ge=0, le=1)


class Afecto(_Base):
    distancia_afectiva: DistanciaAfectiva
    ironia: Ironia
    parrafos: list[ParrafoAfecto]


class Analisis(_Base):
    eje_x: Eje
    eje_y: Eje
    enunciacion: Enunciacion
    polifonia: Polifonia
    tiempo: Tiempo
    argumentacion: Argumentacion
    figuracion: Figuracion
    intertextualidad: Intertextualidad
    lector_implicito: LectorImplicito
    apertura: Apertura
    cierre: Cierre
    temas: Temas
    afecto: Afecto


DIMENSIONES = tuple(Analisis.model_fields)


def subset_model(fields: list[str]) -> type[BaseModel]:
    """Un modelo con solo algunas dimensiones: para el reintento de las que
    vinieron con evidencia inválida."""
    return create_model(
        "AnalisisParcial",
        __config__=ConfigDict(extra="forbid"),
        **{name: (Analisis.model_fields[name].annotation, ...) for name in fields},
    )


# Palabras clave que el esquema estricto de salida estructurada no admite en
# todos los proveedores: los límites se validan después con pydantic.
_UNSUPPORTED = {"minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "minLength", "maxLength",
                "minItems", "maxItems", "title", "default"}


def strict_json_schema(model: type[BaseModel]) -> dict:
    schema = model.model_json_schema()

    def walk(node):
        if isinstance(node, dict):
            for key in list(node):
                if key in _UNSUPPORTED:
                    del node[key]
            if node.get("type") == "object" and "properties" in node:
                node["additionalProperties"] = False
                node["required"] = list(node["properties"])
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for item in node:
                walk(item)

    walk(schema)
    return schema
