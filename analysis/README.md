# Worker del compass editorial

Implementa el spec «Compass editorial y análisis literario de posts». Lee los textos que sube
el agente (`post_texts`), los analiza en batch en tres capas y escribe el resultado en Neon. La
app (`/textos` y la ficha de cada post) solo lo lee.

```
Grokbot ──POST /api/ingest/texts──▶ post_texts ──▶ worker (este directorio) ──▶ tablas del análisis ──▶ /textos
```

## Capas

| Capa | Qué hace | Con qué | Tablas |
| --- | --- | --- | --- |
| 1 · `estilometria` | Las 13 features del spec, crudas; z-scores sobre el corpus | spaCy `es_core_news_lg`, sin LLM | `post_stylometry`, `stylometry_norms` |
| 2 · `afecto` | Valencia y emoción por párrafo (baseline), arco, medias y rango | pysentimiento (RoBERTuito) | `post_paragraphs`, `post_affect` |
| 3 · `literario` | Compass (X, Y), dimensiones literarias, temas, referencias; y del afecto: activación, distancia afectiva, ironía y corrección de la emoción | LLM con salida estructurada | `post_literary`, `post_themes`, `post_references` (+ columnas LLM de las de afecto) |

Las reglas del spec que viven en código:

- **Vocabularios cerrados** en `perpetuo_analysis/vocab.py`, repetidos en los `check` de
  `db/schema.sql` y en `src/lib/compass-vocab.ts`. `tests/test_vocab.py` falla si se separan.
- **Regla de evidencia** (`literary.py`): cada cita se busca en el texto normalizado (sin
  acentos, minúsculas, espacios colapsados; además se unifican comillas tipográficas). Si falta,
  se piden de nuevo **solo esas dimensiones**, una vez; si siguen mal, quedan con
  `evidencia_invalida = true` (en `dimensiones` y en `campos_evidencia_invalida`).
- **Textos largos**: más de 12.000 tokens → secciones de hasta 8.000 tokens y una llamada de
  síntesis. Los párrafos se registran por sección.
- **Párrafos**: los de menos de 15 tokens se fusionan con el siguiente (el último, con el
  anterior).
- **Arco**: valencia del baseline suavizada con media móvil de ventana 3, clasificada por
  correlación con plantillas de las seis formas de Reagan et al. (2016). `null` con menos de 6
  párrafos o con curva plana. `arco_ajuste` guarda la correlación.
- **Emoción dominante**: gana la del LLM si su confianza es mayor que la del baseline. Se
  guardan las dos (`emocion_baseline`, `emocion_llm`) para compararlas.
- **Ironía**: si es `true`, la UI marca la valencia como poco confiable.
- **Normas**: media y desviación de cada feature sobre el corpus; se recalculan cuando el
  corpus crece más de 10%. Los z-scores se calculan al leer.
- **Re-análisis**: cada capa guarda el `content_hash` del texto y la versión de sus reglas
  (`VERSION_*` en `vocab.py`). Si cambia el texto, la versión o el modelo, se rehace.

### Decisiones donde el spec no decía

- **NER**: los modelos de spaCy en español no etiquetan fechas ni porcentajes y marcan como
  `MISC` cualquier tramo con mayúscula inicial. Para `densidad_referencial` cuentan `PER`, `LOC`,
  `ORG` y `MISC` solo si es nombre propio; fechas y porcentajes salen de expresiones regulares.
- **`profundidad_sintactica`**: profundidad máxima del árbol de cada oración, promediada.
- **`ratio_subordinacion`**: relaciones `advcl`, `ccomp`, `csubj`, `acl`, `acl:relcl` por
  oración (`xcomp` no cuenta).
- **`densidad_citas`**: fragmentos entre comillas de 3 palabras o más (para no contar comillas
  irónicas) más párrafos que empiezan con `>`.
- **`longitud_tokens`** y los "15 tokens" de los párrafos: tokens de spaCy sin puntuación.
- **Activación por párrafo**: el spec no dice quién la da y pysentimiento no la mide, así que la
  da el LLM. El LLM también da una valencia por párrafo (`valencia_llm`) para comparar; la que
  cuenta es la del baseline.
- **Medias y rango** usan la valencia cruda; solo el arco usa la suavizada.
- **pysentimiento** tiene contexto corto (128 tokens): un párrafo largo se parte por oraciones y
  se promedia ponderando por longitud.
- **Alertas de anclaje** (en la app, `lib/compass.ts`): si X ≥ 75 con densidad referencial
  z ≥ 1 (o X ≤ 25 con z ≤ −1), o Y ≥ 75 con primera persona z ≤ −1 (o Y ≤ 25 con z ≥ 1), se avisa
  de que el LLM contradice la estilometría.

### Pendiente

- **Taxonomía de temas**: el spec remite a una sección «Supuestos» que no venía en el documento.
  La de `vocab.py` es **provisional** (22 temas). Se cambia ahí y en el `insert` de
  `theme_taxonomy` en `db/schema.sql`; luego hay que subir `VERSION_PROMPT`.
- **Calibración humana de las rúbricas**: van literales en `prompts.py`. Tras calibrar, se
  ajustan y se sube `VERSION_PROMPT`.

## Correr

Requiere Python 3.11+ y que `npm run db:migrate` ya haya creado las tablas.

```bash
cd analysis
python -m venv .venv && source .venv/bin/activate
pip install torch --index-url https://download.pytorch.org/whl/cpu   # sin CUDA, mucho más liviano
pip install -r requirements.txt
python -m spacy download es_core_news_lg
```

Variables (se leen también de `.env.local` / `.env` en la raíz del repo):

| Variable | Qué |
| --- | --- |
| `DATABASE_URL` | La conexión de Neon de la app |
| `LLM_API_KEY` (o `XAI_API_KEY`) | Clave del LLM |
| `LLM_BASE_URL` | Opcional. Cualquier API compatible con OpenAI y `json_schema`; por defecto `https://api.x.ai/v1` (Grok) |
| `LLM_MODEL` | Opcional. Por defecto `grok-4` |
| `SPACY_MODEL` | Opcional. Por defecto `es_core_news_lg` |

```bash
python -m perpetuo_analysis run                         # todo lo pendiente, las tres capas
python -m perpetuo_analysis run --capas estilometria    # solo la capa 1 (sin LLM ni pysentimiento)
python -m perpetuo_analysis run --slug mi-post --forzar # re-analizar un post
python -m perpetuo_analysis run --limite 5              # probar con pocos
python -m perpetuo_analysis normas                      # recalcular z-scores a mano
python -m perpetuo_analysis borrador borrador.txt       # analizar un texto sin guardarlo (JSON)
```

Sin clave del LLM, `run` hace las capas 1 y 2 y deja la 3 pendiente. Cada corrida, exitosa o
no, queda en `analysis_runs` por post y capa.

### En GitHub Actions

`.github/workflows/analysis.yml` corre martes, jueves y sábado (10:17 en Ciudad de México,
después de las cargas) y a mano desde **Actions → Análisis literario → Run workflow**, con
opciones de capas, slug, límite y forzar. Necesita los secrets `DATABASE_URL` y `LLM_API_KEY`;
`LLM_MODEL` y `LLM_BASE_URL` opcionales como variables del repo.

## Pruebas

```bash
pip install -r requirements-dev.txt
python -m pytest
```

Sin red ni modelos: cubren párrafos, evidencia, arco, MTLD, fechas y porcentajes, el flujo de
reintento y de secciones del LLM (con un LLM falso) y la sincronía de vocabularios entre Python,
SQL y TypeScript. Corren en CI con `.github/workflows/analysis-tests.yml`.
