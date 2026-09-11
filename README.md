# Perpetuo Analytics

Web app de analítica para la publicación de Substack **Perpetuo**. Next.js (App Router) + Supabase (Postgres) + Vercel.

## Filtros

Las cuatro secciones de posts (`/`, `/rankings`, `/dashboards`, `/promedios`) comparten
una sola barra de filtros: chips de un clic para el rango de fechas (7 / 30 / 90 días,
6 meses, 1 año, o fechas exactas) y para las secciones (multi-selección: Estelar,
Anteojos Editorial, El Creativo, Ensayo, Cuento, Poema, Foto-Ensayo). El filtro recorta
todo lo que hay debajo a la vez — tablas, rankings y charts — así que los números de una
página nunca se contradicen entre sí.

El estado vive en la URL, no en React (`lib/filters.ts`), lo que da tres cosas gratis:
el filtro es compartible por enlace, el botón "atrás" del navegador deshace un filtro a
la vez, y la nav lo arrastra al cambiar de sección. El rango se guarda **relativo**
(`?rango=30`) y se resuelve a fechas absolutas en el servidor en cada request, para que
un enlace compartido no se congele en las fechas del día que se copió.

## Funcionalidad

- **`/subir`** (protegida por contraseña): carga semanal de un Excel/CSV con métricas por post (mapea columnas en español/inglés automáticamente) y carga del export de suscriptores de Substack (columnas fijas, sin mapeo manual).
- **`/`**: tabla ordenable por cualquier métrica (views, open rate, nuevos suscriptores, engagement) más búsqueda por título, sobre el snapshot más reciente de cada post.
- **`/rankings`**: rankings en barras, globales y partidos por sección, por la métrica que elijas (views, open rate, nuevos suscriptores o engagement).
- **`/post/[slug]`**: evolución de métricas de un post a través de los snapshots semanales.
- **`/promedios`**: promedios agregados y media móvil histórica de las métricas de posts.
- **`/dashboards`**: scatter (open rate vs. views, views vs. nuevos suscriptores) y series temporales por sección.
- **`/suscriptores`**: panel de analítica de suscriptores — KPIs, desgloses (tipo, sección, país, actividad, open rate, antigüedad), crecimiento neto acumulado y comparación gratis-vs-pago.
- **`/suscriptores/lista`**: búsqueda, filtros y paginación sobre la base completa de suscriptores.
- **`/suscriptores/[id]`**: ficha individual de un suscriptor (antigüedad, métricas de engagement, preferencias de sección, evolución si hay más de una carga).

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

Ver [`supabase/schema.sql`](./supabase/schema.sql) y las migraciones en [`supabase/migrations/`](./supabase/migrations/) (pega cada archivo nuevo en Supabase → SQL Editor → Run, en orden). Resumen:

- `posts`: identidad estable de cada post (slug derivado del título; la URL es opcional).
- `metric_snapshots`: una fila nueva por post en cada carga semanal — nunca se sobrescribe el histórico.
- `current_metrics` (vista): el snapshot más reciente de cada post.
- `subscribers`: identidad de cada suscriptor (email) + atributos descriptivos (tipo, plan, fechas de alta/baja, país, preferencias de sección) que se actualizan en cada carga.
- `subscriber_snapshots`: las métricas cuantitativas de actividad (aperturas, clics, views, comentarios, shares, revenue) por carga — mismo patrón de histórico que `metric_snapshots`.
- `current_subscriber_metrics` (vista): el snapshot más reciente de cada suscriptor, con open rate y click rate ya calculados (`0003_fix_open_rate_6mo.sql` corrige el open rate para que no pase de 100%).

`0004_post_type_rename_and_backfill.sql` renombra "321 Editorial" a "El Creativo" en los posts ya cargados y completa el `post_type` de los que quedaron sin tipo, usando el calendario editorial fijo (lunes = Estelar, miércoles = Anteojos Editorial, viernes = El Creativo — ver `lib/post-types.ts`). Las cargas nuevas hacen lo mismo automáticamente cuando el CSV no trae `post_type`.

## Desarrollo local

```bash
npm install
cp .env.example .env.local   # completa las variables (ver más abajo)
npm run dev
```

## Variables de entorno

| Variable | De dónde sale |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → anon public |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → service_role secret (nunca la expongas) |
| `UPLOAD_PASSWORD` | La contraseña que tú elijas para entrar a `/subir` |
| `SESSION_SECRET` | Cadena aleatoria larga, ej. `openssl rand -hex 32` |
| `ANALYTICS_API_KEY` | Cadena aleatoria larga (ej. `openssl rand -hex 32`) que protege `/api/subscribers/lookup` |

## API para integraciones (n8n)

- **`GET /api/subscribers/lookup?email=...`**: dado el email de un suscriptor, devuelve todos sus datos de `current_subscriber_metrics` (tipo, plan, país, antigüedad, revenue, open rate, actividad, secciones, etc.) más un resumen ya formateado en mrkdwn de Slack (`slackSummary`), listo para pegar en un mensaje. Requiere el header `x-api-key: <ANALYTICS_API_KEY>`; sin ese header (o si la variable no está configurada en el servidor) responde 401/500. Si el email no está en la base devuelve `{ found: false, slackSummary: "..." }` con status 200.

  Lo usa el workflow de n8n **"Perpetuo: Bajas Substack → Slack + Apollo Unsubs"**: al detectar un email de baja, le pega a este endpoint y postea `slackSummary` en el canal de Slack en vez del texto genérico anterior.
