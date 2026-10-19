-- Migración incremental: pega este archivo en Supabase → SQL Editor → Run.
--
-- Los suscriptores de la Universidad del Meta (correo @unimeta.edu.co, o un
-- subdominio) entraron en bloque y el export de Substack los trae sin país.
-- Se marcan como Colombia. Las cargas siguientes ya lo hacen solas (ver
-- countryFromEmail en lib/geo.ts), así que esto solo corrige lo ya cargado.

update subscribers
set country = 'Colombia'
where (lower(email) like '%@unimeta.edu.co' or lower(email) like '%.unimeta.edu.co')
  and country is distinct from 'Colombia';
