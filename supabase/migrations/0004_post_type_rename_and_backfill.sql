-- Migración incremental: pega este archivo en Supabase → SQL Editor → Run.
--
-- 1) "321 Editorial" se renombró a "El Creativo" (ver lib/post-types.ts).
--    Los posts ya cargados con el nombre viejo se actualizan al nuevo para
--    que todo quede junto en los leaderboards, timelines y estilos por tipo.
--    (La app también reconoce "321 Editorial" como alias al importar, por si
--    algún CSV viejo se vuelve a subir — ver matchPostType — pero el dato
--    guardado en `posts` conviene dejarlo ya con el nombre actual.)
--
-- 2) Backfill de post_type usando el calendario editorial fijo (lunes =
--    Estelar, miércoles = Anteojos Editorial, viernes = El Creativo) para
--    los posts que quedaron sin tipo porque los CSVs recientes no lo traen.
--    Solo toca filas con post_type NULL — nunca pisa un tipo que ya estaba
--    cargado (a mano o desde un CSV viejo). El viernes es un valor de mejor
--    esfuerzo: ese día también salen piezas sueltas (Ensayo, Cuento, Poema,
--    Foto-Ensayo, Anuncio, etc.) que vas a tener que corregir a mano desde
--    "Corregir datos" en /post/[slug] — el backfill no puede distinguirlas
--    de "El Creativo" solo por la fecha.

update posts set post_type = 'El Creativo' where post_type = '321 Editorial';

update posts
set post_type = case extract(dow from published_at)
    when 1 then 'Estelar'
    when 3 then 'Anteojos Editorial'
    when 5 then 'El Creativo'
  end
where post_type is null
  and published_at is not null
  and extract(dow from published_at) in (1, 3, 5);
