# Perpetuo Analytics

Web app de analítica para la publicación de Substack **Perpetuo**. Next.js (App Router) + Neon (Postgres y Neon Auth) + Vercel.

## Filtros

Las secciones de posts (`/`, `/rankings`, `/dashboards`, `/promedios`, `/tendencias`) comparten
una sola barra de filtros: chips de un clic para el rango de fechas (7 / 30 / 90 días,
6 meses, 1 año, o fechas exactas) y para las secciones (multi-selección: Sobremesa, Estelar,
Anteojos Editorial, El Creativo, Ensayo, Cuento, Poema, Foto-Ensayo, Reseña, más las que se
creen desde `/subir`). El filtro recorta
todo lo que hay debajo a la vez — tablas, rankings y charts — así que los números de una
página nunca se contradicen entre sí.

El estado vive en la URL, no en React (`lib/filters.ts`), lo que da tres cosas gratis:
el filtro es compartible por enlace, el botón "atrás" del navegador deshace un filtro a
la vez, y la nav lo arrastra al cambiar de sección. El rango se guarda **relativo**
(`?rango=30`) y se resuelve a fechas absolutas en el servidor en cada request, para que
un enlace compartido no se congele en las fechas del día que se copió.

## Categorías múltiples e ingresos

Un post puede tener **más de una categoría**: `posts.post_type` es la principal (la que
trae el CSV o se infiere por día de la semana, y la que da el color en los charts) y
`posts.extra_post_types` guarda las adicionales, que se asignan desde "Corregir datos" en
`/post/[slug]`. Un Poema que también salió en El Creativo cuenta en las dos secciones:
aparece al filtrar por cualquiera, entra en el ranking de ambas y suma en las series por
sección. Las cargas semanales solo reescriben la principal, nunca las adicionales.

La columna **"Estimated value"** del export de Substack se guarda como
`metric_snapshots.estimated_value` (USD) y se muestra como "Ingresos" en la tabla, los
rankings, los stat tiles y la ficha de cada post.

## Funcionalidad

- **Cargas automáticas** (martes, jueves y sábado): un agente descarga los exports de Substack y los sube a `POST /api/ingest/posts` y `POST /api/ingest/subscribers` con `INGEST_API_KEY`. Ver [`docs/ingest-api.md`](./docs/ingest-api.md).
- **`/subir`** (requiere cuenta de admin, ver "Acceso"): registro de las cargas automáticas (y sus errores), carga manual de un Excel/CSV con métricas por post (mapea columnas en español/inglés automáticamente) y del export de suscriptores de Substack (columnas fijas). La carga manual y la automática usan el mismo código (`lib/imports/`).
- **`/`**: tabla ordenable por cualquier métrica (views, open rate, nuevos suscriptores, engagement, ingresos estimados) más búsqueda por título, sobre el snapshot más reciente de cada post.
- **`/rankings`**: rankings en barras, globales y partidos por sección, por la métrica que elijas (views, open rate, nuevos suscriptores, engagement o ingresos estimados).
- **`/post/[slug]`**: interés a lo largo del tiempo (vistas nuevas por día entre cargas, con el pico y los repuntes marcados) y evolución de cada métrica a través de las cargas.
- **`/tendencias`**: posts en alza entre las dos últimas cargas, posts viejos con "segunda vida" (≥3× su ritmo habitual y 5+ vistas/día, publicados hace más de 21 días) e interés por sección semana a semana (`lib/interest.ts`).
- **`/promedios`**: promedios agregados y media móvil histórica de las métricas de posts.
- **`/dashboards`**: scatter (open rate vs. views, views vs. nuevos suscriptores) y series temporales por sección.
- **`/suscriptores`**: panel de analítica de suscriptores — KPIs, desgloses (tipo, sección, país, región, actividad, open rate, antigüedad), crecimiento neto acumulado y comparación gratis-vs-pago.
- **`/suscriptores/retencion`**: retención a 1 y 3 meses por mes de alta y conversión a pago en 30/90 días (de las fechas de alta, baja y pago: cubre todo el histórico), y engagement en el primer y tercer mes de quienes se quedan vs. quienes se van (de las cargas automáticas: se llena a medida que se suman cargas).
- **`/suscriptores/geografia`**: de dónde vienen y cómo cambia — ranking de países y regiones, cambio neto por país en la ventana elegida (90 días / 6 meses / 1 año), tabla con peso sobre la lista y miniatura de tendencia, histórico mes a mes por país (en suscriptores o en % del total) y por región, y desglose por estado/provincia.
- **`/suscriptores/lista`**: búsqueda, filtros y paginación sobre la base completa de suscriptores.
- **`/suscriptores/[id]`**: ficha individual de un suscriptor (antigüedad, métricas de engagement, preferencias de sección, evolución si hay más de una carga).

## De dónde vienen los suscriptores

`/suscriptores/geografia` responde dos preguntas distintas: dónde está el público hoy
y hacia dónde se está moviendo.

El **histórico no está guardado, se reconstruye**. `subscribers` no tiene una foto del
país mes a mes — el país se pisa en cada carga — pero sí guarda `start_date` y
`cancel_date`, y con esas dos fechas se sabe, para cualquier momento del pasado, quién
estaba dado de alta. Agrupando por país sale la serie de cada uno sin haber guardado
nada extra (`lib/subscriber-geo.ts`). Eso implica dos límites, que la propia página
dice en pantalla: el país es el **actual** (quien se mudó arrastra toda su historia a
su país de hoy), y solo se puede reconstruir a quien sigue en el export (los cancelados
están, con su fecha de baja; quien fue borrado de la lista, no).

Los países se **normalizan antes de agrupar** (`lib/geo.ts`): "Spain", "España" y "ES"
son el mismo país, y cada uno cae en su región del mundo. Sin eso, el mismo país
aparecía partido en varias barras. La normalización también la usa el filtro por país
de `/suscriptores/lista`, así que el enlace "ver la lista de España" funciona sea cual
sea la grafía que traiga la carga.

Un país entra en "quién sube y quién baja" solo si se movió **al menos 3 suscriptores y
un 5% de su base**: por debajo de ese piso, un país con cuatro suscriptores que gana uno
aparecería "creciendo 25%" arriba de todo. El histórico se puede ver en suscriptores o
en **% del total**: mientras la lista crece, un país puede sumar todos los meses y aun
así estar perdiendo peso, y con una sola de las dos vistas eso no se ve.

## Identidad visual

Azul `#0f52a0` y crema `#f9f6f1` sobre un fondo de manchas granuladas que enmarcan la
página (CSS y SVG, sin WebGL ni dependencias: ver la sección "Fondo granulado" de
`app/globals.css`). Todo el movimiento respeta `prefers-reduced-motion`.

Los siete tipos de post tienen un color y una forma fijos en todos los charts
(`lib/post-type-style.ts`). La paleta está validada contra la superficie de la app:
pasa banda de luminosidad, piso de croma, separación bajo daltonismo y piso de visión
normal en la lista de pares adyacentes. Tres colores quedan bajo 3:1 de contraste, así
que todos los charts que los usan llevan etiquetas directas y un "Ver como tabla" — el
valor nunca depende de distinguir el color.

## Modelo de datos

Todo el esquema está en [`db/schema.sql`](./db/schema.sql) (antes eran `supabase/schema.sql` + 7 migraciones; quedó consolidado en un solo archivo idempotente). Para aplicarlo o actualizarlo:

```bash
npm run db:migrate
```

Corre contra `DATABASE_URL_UNPOOLED` (la conexión directa, la recomendada por Neon para cambios de esquema). Resumen:

- `posts`: identidad estable de cada post (slug derivado del título; la URL es opcional).
- `metric_snapshots`: una fila nueva por post en cada carga (tres por semana con las cargas automáticas) — nunca se sobrescribe el histórico. Las series de `/dashboards` y `/promedios` las agrupan por semana (la última carga de cada semana).
- `current_metrics` (vista): el snapshot más reciente de cada post.
- `post_categories`: las secciones, editables desde `/subir`.
- `subscribers`: identidad de cada suscriptor (email) + atributos descriptivos (tipo, plan, fechas de alta/baja, país, estado/provincia, preferencias de sección) que se actualizan en cada carga. `start_date` y `cancel_date` son las que sostienen todo el histórico de `/suscriptores/geografia`.
- `subscriber_snapshots`: las métricas cuantitativas de actividad (aperturas, clics, views, comentarios, shares, revenue) por carga. Para no llenar la base con tres cargas por semana, después de cada carga se conservan solo las fotos de los primeros 100 días de cada suscriptor, su foto más reciente y la primera de cada mes (`lib/imports/retention-policy.ts`).
- `ingest_runs`: registro de cada carga que llegó por la API de ingesta (exitosa o no).
- `current_subscriber_metrics` (vista): el snapshot más reciente de cada suscriptor, con open rate (sobre correos únicos vistos, con tope de 100%) y click rate ya calculados.

Cuando un CSV de posts no trae `post_type`, la carga lo infiere del calendario editorial fijo (lunes = Estelar, miércoles = Anteojos Editorial, viernes = El Creativo — ver `lib/post-types.ts`).

La app habla con Postgres solo desde el servidor (`lib/db.ts`, driver `@neondatabase/serverless` por HTTPS). La base no tiene una API pública: nadie fuera del servidor puede leerla, ni siquiera la lista de suscriptores.

## Acceso

`/subir` y la corrección manual de posts piden una cuenta de **Neon Auth** (correo y contraseña). Cualquiera puede crearse una cuenta desde `/subir`, pero solo los correos listados en `ADMIN_EMAILS` pueden cargar o modificar datos; el resto ve un aviso de "sin permiso". Si `ADMIN_EMAILS` no está configurada, nadie es admin. Las cuentas viven en el esquema `neon_auth` de la misma base.

Las páginas de lectura (`/`, `/rankings`, `/suscriptores`, etc.) siguen siendo públicas.

## Desarrollo local

```bash
npm install
neon env pull                # escribe DATABASE_URL, NEON_AUTH_BASE_URL, etc. en .env.local
# agrega a .env.local: NEON_AUTH_COOKIE_SECRET, ADMIN_EMAILS y ANALYTICS_API_KEY
npm run db:migrate           # solo la primera vez, o si cambió db/schema.sql
npm run dev
```

## Variables de entorno

| Variable | De dónde sale |
| --- | --- |
| `DATABASE_URL` | Neon (conexión con pooler). La escribe `neon env pull` / `neon deploy` |
| `DATABASE_URL_UNPOOLED` | Neon (conexión directa, para `npm run db:migrate`). La escribe `neon env pull` |
| `NEON_AUTH_BASE_URL` | URL de Neon Auth de la rama. La escribe `neon env pull` |
| `NEON_AUTH_COOKIE_SECRET` | Cadena aleatoria de 32+ caracteres, ej. `openssl rand -base64 32` |
| `ADMIN_EMAILS` | Correos con permiso de admin, separados por coma |
| `ANALYTICS_API_KEY` | Cadena aleatoria larga (ej. `openssl rand -hex 32`) que protege `/api/subscribers/lookup` (solo lectura; la usa n8n) |
| `INGEST_API_KEY` | Otra cadena aleatoria larga, distinta de la anterior: la clave de escritura de la API de ingesta (la usa el agente de cargas automáticas) |
| `INGEST_TIMEZONE` | Opcional. Zona horaria para la fecha de las cargas automáticas (por defecto `America/Mexico_City`) |

## API para integraciones (n8n)

- **`GET /api/subscribers/lookup?email=...`**: dado el email de un suscriptor, devuelve todos sus datos de `current_subscriber_metrics` (tipo, plan, país, antigüedad, revenue, open rate, actividad, secciones, etc.) más un resumen ya formateado en mrkdwn de Slack (`slackSummary`), listo para pegar en un mensaje. Requiere el header `x-api-key: <ANALYTICS_API_KEY>`; sin ese header (o si la variable no está configurada en el servidor) responde 401/500. Si el email no está en la base devuelve `{ found: false, slackSummary: "..." }` con status 200.

  Lo usa el workflow de n8n **"Perpetuo: Bajas Substack → Slack + Apollo Unsubs"**: al detectar un email de baja, le pega a este endpoint y postea `slackSummary` en el canal de Slack en vez del texto genérico anterior.
