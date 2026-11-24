# API de ingesta — cargas automáticas desde Substack

Para el agente (Grok) que descarga los exports de Substack y los sube a Perpetuo Analítica.
Es lo mismo que la carga manual de `/subir`, pero por HTTP.

## Cuándo

**Martes, jueves y sábado** (el día después de cada publicación: lunes, miércoles y viernes).
En cada corrida se suben los dos exports, posts y suscriptores. Subir más de una vez el mismo
día no duplica nada: la segunda carga actualiza la primera.

## Autenticación

Cada request lleva la clave de escritura `INGEST_API_KEY`, en cualquiera de estos dos headers:

```
Authorization: Bearer <INGEST_API_KEY>
x-api-key: <INGEST_API_KEY>
```

Es una clave distinta de `ANALYTICS_API_KEY` (la de solo lectura que usa n8n). Sin clave o con
otra clave, la respuesta es `401`.

## Endpoints

| Qué | Endpoint |
| --- | --- |
| Export de posts (métricas por post) | `POST /api/ingest/posts` |
| Export de suscriptores | `POST /api/ingest/subscribers` |

Base: la URL de producción de la app en Vercel (ej. `https://perpetuo-analytics.vercel.app`).

### Formato del archivo

Se acepta el archivo tal como lo da Substack, de cualquiera de estas formas:

- **CSV o .xlsx crudo en el body** (las opciones van en la query string):

  ```bash
  curl -X POST "$BASE/api/ingest/subscribers" \
    -H "Authorization: Bearer $INGEST_API_KEY" \
    -H "Content-Type: text/csv" \
    --data-binary @suscriptores.csv
  ```

- **Comprimido con gzip** (recomendado para suscriptores: Vercel limita cada request a ~4,5 MB):

  ```bash
  gzip -k suscriptores.csv
  curl -X POST "$BASE/api/ingest/subscribers" \
    -H "Authorization: Bearer $INGEST_API_KEY" \
    -H "Content-Type: application/gzip" \
    --data-binary @suscriptores.csv.gz
  ```

- **multipart/form-data** con el archivo en el campo `file`:

  ```bash
  curl -X POST "$BASE/api/ingest/posts" \
    -H "Authorization: Bearer $INGEST_API_KEY" \
    -F "file=@posts.csv"
  ```

Si el export de suscriptores comprimido igual pasa de 4 MB, se parte en varios archivos, **cada
uno con su fila de encabezados**, y se suben uno tras otro con la misma `snapshotDate`: cada
parte suma sus filas a la misma carga.

### Opciones

| Opción | Dónde | Qué hace |
| --- | --- | --- |
| `snapshotDate=YYYY-MM-DD` | query string o campo del form | Fecha de la carga. Por defecto, hoy en Ciudad de México (`INGEST_TIMEZONE`). |
| `dryRun=1` | query string o campo del form | Lee y valida el archivo y devuelve qué entendió, **sin guardar nada**. Útil para probar. |
| `mapping={"campo":"Columna"}` | query string o campo del form | Solo posts: corrige el mapeo automático de columnas, ej. `{"title":"post_id"}`. Campos: `title`, `author`, `published_at`, `post_type`, `views`, `new_subscribers`, `open_rate`, `click_to_open_rate`, `engagement`, `estimated_value`. |

## Respuestas

Éxito (`200`):

```json
{ "ok": true, "snapshotDate": "2026-11-24", "rows": 4120,
  "summary": { "subscribersCreados": 35, "subscribersActualizados": 4085, "snapshots": 4120, "snapshotsDepurados": 3980 } }
```

Para posts, la respuesta incluye además `mapping`: qué columna del archivo se usó para cada campo.
Conviene revisarlo la primera vez (con `dryRun=1`).

Errores (`ok: false` y un `error` legible):

| Código | Significa | Qué hacer |
| --- | --- | --- |
| `401` | Falta la clave o es incorrecta | Revisar `INGEST_API_KEY`. |
| `400` | Body vacío, archivo ilegible o `snapshotDate` mal escrita | Revisar el archivo y los parámetros. |
| `422` | Falta una columna obligatoria (`Email` en suscriptores, el título en posts) | Es el export equivocado o cambió el formato de Substack; el mensaje lista las columnas recibidas. |
| `500` | Error del servidor o de la base | Reintentar una vez más tarde; si persiste, avisar. |

Cada carga, exitosa o no, queda registrada y se ve en `/subir` → **Cargas automáticas**.

## Instrucciones para el agente

> Los martes, jueves y sábado, descarga desde el dashboard de Substack de Perpetuo el export de
> posts con métricas y el export de suscriptores. Sube cada uno a la API de ingesta de Perpetuo
> Analítica (`POST /api/ingest/posts` y `POST /api/ingest/subscribers`) con el header
> `Authorization: Bearer <INGEST_API_KEY>`. Comprime el de suscriptores con gzip antes de subirlo.
> No mandes `snapshotDate` (se usa la fecha de hoy). Comprueba que cada respuesta tenga
> `"ok": true`; si alguna falla, reintenta una vez y, si vuelve a fallar, reporta el código y el
> campo `error` de la respuesta. Nunca compartas la clave.

## Qué pasa con los datos

- **Posts**: cada carga guarda una foto de las métricas de cada post. La diferencia entre fotos
  es lo que muestra los picos de interés (`/tendencias` y la ficha de cada post).
- **Suscriptores**: cada carga actualiza los datos de cada suscriptor y guarda una foto de su
  actividad. Para no llenar la base, de cada suscriptor se conservan todas las fotos de sus
  primeros 100 días (las que alimentan `/suscriptores/retencion`), la más reciente y la primera
  de cada mes; el resto se borra solo (`snapshotsDepurados` en la respuesta).
