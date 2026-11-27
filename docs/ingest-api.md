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

---

# Textos completos

Además de las métricas, el agente sube el **texto completo de cada post**. El agente solo sube
el texto: el análisis (compass editorial, afecto, dimensiones literarias, estilometría) lo hace
después el worker de [`analysis/`](../analysis/README.md), en batch.

Misma clave (`INGEST_API_KEY`) y mismos headers que el resto de la API.

| Qué | Endpoint |
| --- | --- |
| Qué posts tienen texto | `GET /api/ingest/texts` (`?faltan=1` para ver solo los que no) |
| Subir uno o varios textos | `POST /api/ingest/texts` |
| Comparar un texto nuevo (no se guarda) | `POST /api/textos/comparar` |

## Cuándo

Después de cada carga de métricas (martes, jueves y sábado): `GET /api/ingest/texts?faltan=1`
devuelve los posts que todavía no tienen texto, con su `slug`, `title` y `url`. El agente sube
solo esos. Un post recién publicado aparece en esa lista cuando llega en el export de métricas;
antes, la API no lo encuentra (`404`).

Volver a subir el mismo texto no hace nada (`"texto": "sin cambios"`). Si el texto cambió (una
corrección después de publicar), se reemplaza y el worker lo vuelve a analizar.

## Identificar el post

Cada texto lleva al menos uno de estos campos; se prueban en este orden:

1. `slug`: el de la lista de `GET /api/ingest/texts` (es lo más seguro: copiarlo tal cual).
2. `url`: la URL del post en Substack.
3. `title`: el título exacto (o casi: se aceptan diferencias menores de tildes y signos).

Si no se encuentra, la respuesta trae `sugerencias` con los títulos más parecidos.

## Cómo tiene que venir el texto

El análisis depende de la forma del texto, así que importa:

- **Texto plano en UTF-8**: sin HTML ni Markdown, sin menús, botones, pie de suscripción ni
  comentarios. Puede llevar el título y el subtítulo al principio.
- **Una línea en blanco entre párrafos.** El afecto y el arco emocional se miden por párrafo.
- **Diálogos** con raya (—) al inicio de la línea, como en el original.
- **Citas en bloque** (blockquote de Substack) con `> ` al inicio del párrafo.
- **Comillas** tal como vienen («», “”).
- **Versos**: cada verso en su línea y una línea en blanco entre estrofas.

## Formato de la request

**JSON, varios textos a la vez** (recomendado; máximo 50 por request y ~4 MB en total):

```bash
curl -X POST "$BASE/api/ingest/texts" \
  -H "Authorization: Bearer $INGEST_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"textos": [{"slug": "la-ciudad-que-no-duerme", "texto": "Texto completo…"}]}'
```

También se acepta un solo texto sin la lista (`{"slug": "...", "texto": "..."}`).

**El .txt crudo en el body**, con el post en la query string:

```bash
curl -X POST "$BASE/api/ingest/texts?slug=la-ciudad-que-no-duerme" \
  -H "Authorization: Bearer $INGEST_API_KEY" \
  -H "Content-Type: text/plain; charset=utf-8" \
  --data-binary @la-ciudad-que-no-duerme.txt
```

**multipart/form-data** con el .txt en `file` y `slug`/`url`/`title`:

```bash
curl -X POST "$BASE/api/ingest/texts" \
  -H "Authorization: Bearer $INGEST_API_KEY" \
  -F "slug=la-ciudad-que-no-duerme" \
  -F "file=@la-ciudad-que-no-duerme.txt"
```

`?dryRun=1` (o `"dryRun": true` en el JSON) valida todo y dice qué post encontró, sin guardar.

## Respuesta

```json
{ "ok": false, "dryRun": false,
  "summary": { "textos": 2, "guardados": 1, "fallidos": 1, "creados": 1, "actualizados": 0 },
  "resultados": [
    { "ok": true, "slug": "la-ciudad-que-no-duerme", "titulo": "La ciudad que no duerme",
      "encontradoPor": "slug", "texto": "creado", "palabras": 2310 },
    { "ok": false, "referencia": { "title": "Un post que no existe" },
      "error": "No hay ningún post con ese slug, URL o título…", "sugerencias": [ … ] }
  ] }
```

Status: `200` si entró todo, `207` si entró una parte (ver `resultados`), `404` si era un solo
texto y no se encontró el post, `422` si era un solo texto y no era válido, `400`/`401`/`500`
como en el resto de la API. Cada carga queda en `/subir` → **Cargas automáticas** ("Textos").
`GET /api/ingest/texts` dice además, por post, si ya está `analizado`.

## Comparar un texto nuevo

`POST /api/textos/comparar` con `{"texto": "…"}` (o el .txt crudo en el body) devuelve, sin
guardar nada: los textos de Perpetuo más parecidos por vocabulario (`neighbors`), su lugar
**estimado** en el compass a partir de esos vecinos (`estimatedCompass`) y la sección más
probable (`categories`). Es instantáneo. El análisis completo de un borrador lo hace el worker:
`python -m perpetuo_analysis borrador archivo.txt`.

## Instrucciones para el agente (textos)

> Después de subir las métricas, pide `GET /api/ingest/texts?faltan=1` a Perpetuo Analítica con
> el header `Authorization: Bearer <INGEST_API_KEY>`. Para cada post de la lista, abre su `url`
> en Substack y copia el texto completo del post como texto plano: sin menús, botones, pie de
> suscripción ni comentarios; una línea en blanco entre párrafos; diálogos con raya al inicio;
> citas en bloque con `> ` al inicio; versos en su propia línea. No resumas ni corrijas nada:
> el texto tiene que ser idéntico al publicado. Sube los textos en tandas de hasta 20 con
> `POST /api/ingest/texts` en JSON (`{"textos": [{"slug": …, "texto": …}]}`), usando el `slug`
> exacto de la lista. Comprueba que cada resultado tenga `"ok": true`; si un post da `404`, no
> reintentes hasta la próxima corrida. Reporta los errores con su `error`. Nunca compartas la
> clave.
