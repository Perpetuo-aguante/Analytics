# Encuesta de suscriptores — julio 2026

Análisis de las dos versiones de la encuesta de suscriptores (Typeform, 54 respuestas;
Google Forms, 33 respuestas), unificadas en una sola base de **81 lectores únicos**.

## Archivos

- `analyze_survey.py` — une y limpia ambos CSV: excluye 4 respuestas de prueba del equipo,
  fusiona 2 personas que contestaron ambos formularios y normaliza respuestas abiertas
  (profesión, país, revistas, deseos). Uso:
  `python3 analyze_survey.py <typeform.csv> <googleforms.csv> <outdir>`
- `aggregate.json` — conteos por pregunta, sin datos personales. Salida del script.
- `encuesta-suscriptores.html` — informe visual completo (demografía, hábitos, dieta
  lectora, deseos y las tres personas de lector). Es autocontenido: se abre en cualquier
  navegador.

Los CSV crudos **no** se versionan porque contienen correos de suscriptores; el script
los recibe por argumento.
