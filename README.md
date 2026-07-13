# Perpetuo Analytics

Web app de analítica para la publicación de Substack **Perpetuo**. Next.js (App Router) + Supabase (Postgres) + Vercel.

## Funcionalidad

- **`/subir`** (protegida por contraseña): carga semanal de un Excel/CSV con métricas por post. Mapea columnas en español/inglés automáticamente y deja revisar el mapeo antes de importar.
- **`/`**: búsqueda y filtros (tema, tipo de post) sobre el snapshot más reciente de cada post.
- **`/rankings`**: leaderboards por nuevos suscriptores, views y engagement.
- **`/post/[slug]`**: evolución de métricas de un post a través de los snapshots semanales.

## Modelo de datos

Ver [`supabase/schema.sql`](./supabase/schema.sql). Resumen:

- `posts`: identidad estable de cada post (slug derivado del título; la URL es opcional).
- `metric_snapshots`: una fila nueva por post en cada carga semanal — nunca se sobrescribe el histórico.
- `current_metrics` (vista): el snapshot más reciente de cada post.

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
