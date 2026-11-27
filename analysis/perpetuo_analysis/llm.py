"""Cliente del LLM: cualquier API compatible con OpenAI chat completions
con salida estructurada (json_schema). Por defecto, Grok (xAI).

Variables de entorno:
  LLM_API_KEY (o XAI_API_KEY)   clave de la API
  LLM_BASE_URL                  por defecto https://api.x.ai/v1
  LLM_MODEL                     por defecto grok-4
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field

from pydantic import BaseModel, ValidationError

from .schemas import strict_json_schema


@dataclass
class Usage:
    entrada: int = 0
    salida: int = 0
    llamadas: int = 0

    def add(self, usage) -> None:
        self.llamadas += 1
        if usage is not None:
            self.entrada += getattr(usage, "prompt_tokens", 0) or 0
            self.salida += getattr(usage, "completion_tokens", 0) or 0


@dataclass
class LLM:
    model: str = field(default_factory=lambda: os.environ.get("LLM_MODEL", "grok-4"))
    base_url: str = field(default_factory=lambda: os.environ.get("LLM_BASE_URL", "https://api.x.ai/v1"))
    usage: Usage = field(default_factory=Usage)

    def __post_init__(self) -> None:
        api_key = os.environ.get("LLM_API_KEY") or os.environ.get("XAI_API_KEY")
        if not api_key:
            raise RuntimeError("Falta LLM_API_KEY (o XAI_API_KEY) para la capa de análisis literario.")
        from openai import OpenAI

        self._client = OpenAI(api_key=api_key, base_url=self.base_url, timeout=600)

    def complete(self, messages: list[dict], model_cls: type[BaseModel]) -> tuple[BaseModel, str]:
        """Pide una respuesta con el esquema de `model_cls` y la valida. Si no
        cumple el esquema (un valor fuera de rango, un campo de más), le
        devuelve el error y reintenta una vez. Devuelve (objeto, JSON crudo)."""
        attempt_messages = list(messages)
        last_error: Exception | None = None
        for _ in range(2):
            response = self._client.chat.completions.create(
                model=self.model,
                messages=attempt_messages,
                response_format={
                    "type": "json_schema",
                    "json_schema": {"name": model_cls.__name__, "schema": strict_json_schema(model_cls), "strict": True},
                },
            )
            self.usage.add(response.usage)
            content = response.choices[0].message.content or ""
            try:
                return model_cls.model_validate_json(content), content
            except ValidationError as err:
                last_error = err
                attempt_messages = attempt_messages + [
                    {"role": "assistant", "content": content},
                    {"role": "user", "content": f"Tu JSON no cumple el esquema: {_short(err)}. Devuélvelo corregido completo."},
                ]
        raise RuntimeError(f"El LLM no devolvió un JSON válido: {_short(last_error)}")


def _short(err: Exception | None) -> str:
    if isinstance(err, ValidationError):
        return json.dumps(
            [{"campo": ".".join(map(str, e["loc"])), "error": e["msg"]} for e in err.errors()[:8]], ensure_ascii=False
        )
    return str(err)
