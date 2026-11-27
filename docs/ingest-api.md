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

# Textos completos y compass editorial

Además de las métricas, el agente sube el **texto completo de cada post** y, en el mismo paso,
su **lectura del compass**: los dos ejes (referencial ↔ poético, impersonal ↔ subjetivo) y
tesis, figuración, intertextualidad, lector implícito, apertura, cierre y temas. La app valida
la lectura (vocabularios cerrados y que cada cita exista en el texto) y calcula por su cuenta,
sin LLM, una estilometría mínima para anclar los ejes.

Misma clave (`INGEST_API_KEY`) y mismos headers que el resto de la API.

| Qué | Endpoint |
| --- | --- |
| La guía de lectura (rúbricas, campos y formato) | `GET /api/ingest/texts/guia` |
| Qué posts tienen texto y lectura | `GET /api/ingest/texts` (`?faltan=1&limite=N` para lo pendiente) |
| Subir textos y su lectura | `POST /api/ingest/texts` |
| Comparar un texto nuevo (sin LLM; no se guarda) | `POST /api/textos/comparar` |

## Tokens: cómo se mantiene barato

La lectura la hace el propio agente, sin otra API ni otra clave. Lo que agrega por post es poco,
porque el texto ya lo lee para copiarlo:

- La **guía** (~2.000 tokens) se lee **una vez por corrida**, no por post.
- La **respuesta por post** es un JSON corto: ~600–800 tokens, con citas de 5 a 15 palabras.
- Los **reintentos** son solo de los campos con una cita que no está en el texto, y una sola vez.
- Solo se analiza lo pendiente: textos nuevos, textos que cambiaron o lecturas hechas con una
  versión anterior de la guía.
- El **histórico** se carga por tandas con `?faltan=1&limite=20` (los más recientes primero):
  no hace falta procesar todo de una vez.

## Cuándo

Después de cada carga de métricas (martes, jueves y sábado): `GET /api/ingest/texts?faltan=1`
devuelve los posts que no tienen texto (`tiene_texto: false`) o no tienen una lectura vigente
(`analizado: false`). Un post recién publicado aparece cuando llega en el export de métricas;
antes, la API no lo encuentra (`404`).

Volver a subir el mismo texto no hace nada (`"texto": "sin cambios"`). Si el texto cambió, se
reemplaza y su lectura queda pendiente de nuevo.

## Identificar el post

Cada texto lleva al menos uno de estos campos; se prueban en este orden:

1. `slug`: el de la lista de `GET /api/ingest/texts` (es lo más seguro: copiarlo tal cual).
2. `url`: la URL del post en Substack.
3. `title`: el título exacto (o casi: se aceptan diferencias menores de tildes y signos).

Si no se encuentra, la respuesta trae `sugerencias` con los títulos más parecidos.

## Cómo tiene que venir el texto

- **Texto plano en UTF-8**: sin HTML ni Markdown, sin menús, botones, pie de suscripción ni
  comentarios. Puede llevar el título y el subtítulo al principio.
- **Una línea en blanco entre párrafos**; diálogos con raya (—) al inicio; citas en bloque con
  `> ` al inicio; comillas tal como vienen.
- **Idéntico al publicado**: las citas de la lectura se buscan literalmente en este texto.

## Formato de la request

**JSON** (recomendado; máximo 50 textos por request y ~4 MB en total):

```bash
curl -X POST "$BASE/api/ingest/texts" \
  -H "Authorization: Bearer $INGEST_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"textos": [{"slug": "la-ciudad-que-no-duerme", "texto": "Texto completo…", "analisis": { … }}]}'
```

`analisis` tiene la forma que describe la guía (`GET /api/ingest/texts/guia`). La primera lectura
de un texto trae todas las dimensiones; después se pueden mandar solo las que se corrigen
(`{"slug": "...", "analisis": {"cierre": {…}}}`, sin `texto`).

También se aceptan el .txt crudo en el body (`?slug=...`, `Content-Type: text/plain`) y
multipart (`file`, `slug` y `analisis` como JSON en texto). `?dryRun=1` (o `"dryRun": true`)
valida todo sin guardar.

## Respuesta

```json
{ "ok": true, "dryRun": false,
  "summary": { "textos": 1, "guardados": 1, "fallidos": 0, "creados": 1, "actualizados": 0, "lecturas": 1, "porReintentar": 1 },
  "resultados": [
    { "ok": true, "slug": "la-ciudad-que-no-duerme", "titulo": "La ciudad que no duerme",
      "encontradoPor": "slug", "texto": "creado", "palabras": 2310, "analisis": "guardado",
      "evidenciaInvalida": ["cierre"], "reintentar": ["cierre"] }
  ] }
```

- `evidenciaInvalida`: campos con una cita que no está en el texto. Se guardan igual, marcados.
- `reintentar`: los que conviene volver a mandar (una vez). Si el reintento tampoco cuadra,
  quedan marcados y no se vuelven a pedir.
- Un valor fuera de vocabulario o de escala rechaza la lectura (y el texto) de ese post con un
  `error` que dice qué corregir.

Status: `200` si entró todo, `207` si entró una parte, `404` si era un solo texto y no se
encontró el post, `422` si era un solo texto y no era válido, `400`/`401`/`500` como en el resto
de la API. Cada carga queda en `/subir` → **Cargas automáticas** ("Textos").

## Comparar un texto nuevo

`POST /api/textos/comparar` con `{"texto": "…"}` devuelve, sin LLM y sin guardar nada: los textos
más parecidos por vocabulario (`neighbors`), su lugar **estimado** en el compass a partir de esos
vecinos (`estimatedCompass`) y la sección más probable (`categories`).

## Instrucciones para el agente (textos y compass)

> Después de subir las métricas:
> 1. Pide `GET /api/ingest/texts/guia` (header `Authorization: Bearer <INGEST_API_KEY>`) y léela
>    una vez: son las rúbricas y el formato de la lectura.
> 2. Pide `GET /api/ingest/texts?faltan=1&limite=20`.
> 3. Para cada post de la lista, abre su `url` en Substack y copia el texto completo como texto
>    plano, idéntico al publicado: sin menús, botones, pie de suscripción ni comentarios; una
>    línea en blanco entre párrafos; diálogos con raya al inicio; citas en bloque con `> `.
> 4. Lee ese texto y arma su `analisis` según la guía. Las citas de evidencia, de 5 a 15
>    palabras, copiadas tal cual.
> 5. Sube los textos con su lectura en tandas de hasta 10 a `POST /api/ingest/texts`
>    (`{"textos": [{"slug": …, "texto": …, "analisis": {…}}]}`), con el `slug` exacto de la lista.
> 6. Si un resultado trae `reintentar`, vuelve a mandar solo esos campos de ese post, una vez
>    (`{"slug": …, "analisis": {<solo esos campos>}}`). Si un post da `404`, déjalo para la próxima
>    corrida. Reporta los `error`. Nunca compartas la clave.
