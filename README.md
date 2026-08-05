# Perpetuo Analytics

Web app de analítica para la publicación de Substack **Perpetuo**. Next.js (App Router) + Supabase (Postgres) + Vercel.

## Funcionalidad

- **`/subir`** (protegida por contraseña): carga semanal de un Excel/CSV con métricas por post (mapea columnas en español/inglés automáticamente) y carga del export de suscriptores de Substack (columnas fijas, sin mapeo manual).
- **`/`**: búsqueda y filtros (tema, tipo de post) sobre el snapshot más reciente de cada post.
- **`/rankings`**: leaderboards por nuevos suscriptores, views y engagement.
- **`/post/[slug]`**: evolución de métricas de un post a través de los snapshots semanales.
- **`/promedios`**: promedios agregados y media móvil histórica de las métricas de posts.
- **`/dashboards`**: scatter y series temporales por sección.
- **`/suscriptores`**: panel de analítica de suscriptores — KPIs, desgloses (tipo, sección, país, actividad, open rate, antigüedad), crecimiento neto acumulado y comparación gratis-vs-pago.
- **`/suscriptores/lista`**: búsqueda, filtros y paginación sobre la base completa de suscriptores.
- **`/suscriptores/[id]`**: ficha individual de un suscriptor (antigüedad, métricas de engagement, preferencias de sección, evolución si hay más de una carga).

## Modelo de datos

Ver [`supabase/schema.sql`](./supabase/schema.sql) y [`supabase/migrations/0002_subscribers.sql`](./supabase/migrations/0002_subscribers.sql). Resumen:

- `posts`: identidad estable de cada post (slug derivado del título; la URL es opcional).
- `metric_snapshots`: una fila nueva por post en cada carga semanal — nunca se sobrescribe el histórico.
- `current_metrics` (vista): el snapshot más reciente de cada post.
- `subscribers`: identidad de cada suscriptor (email) + atributos descriptivos (tipo, plan, fechas de alta/baja, país, preferencias de sección) que se actualizan en cada carga.
- `subscriber_snapshots`: las métricas cuantitativas de actividad (aperturas, clics, views, comentarios, shares, revenue) por carga — mismo patrón de histórico que `metric_snapshots`.
- `current_subscriber_metrics` (vista): el snapshot más reciente de cada suscriptor, con open rate y click rate ya calculados.

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
