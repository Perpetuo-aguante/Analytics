// Vocabularios cerrados del compass editorial (spec «Compass editorial y
// análisis literario de posts», versión lean). Es la fuente de verdad: la
// guía que lee el agente (lib/compass-guide.ts), la validación de lo que
// manda (lib/compass-analysis.ts) y las etiquetas de la app salen de aquí.
// Los `check` de db/schema.sql repiten estas listas: si cambias una, cambia
// las dos.
//
// Puro (sin APIs de Node): se puede importar desde componentes cliente.

export const VOCAB = {
  tesis: ["explícita al inicio", "explícita al final", "implícita", "ausente"],
  polo_dominante: ["metafórico", "metonímico", "equilibrado"],
  tipo_referencia: ["cita", "alusión", "parodia", "epígrafe"],
  tradicion: ["latinoamericana", "española", "europea", "anglo", "clásica", "otra"],
  tipo_gancho: [
    "escena in medias res",
    "pregunta",
    "tesis provocadora",
    "anécdota",
    "dato",
    "cita",
    "imagen",
    "contexto expositivo",
  ],
  cierre: ["abierto", "cerrado", "epifánico", "remate irónico", "circular", "llamado a la acción"],
} as const;

export type VocabKey = keyof typeof VOCAB;

// Taxonomía fija de temas. PROVISIONAL: el spec remite a una sección
// «Supuestos» con la taxonomía que no venía en el documento. Lo político vive
// aquí, no en los ejes. Si cambia, cambiar también el insert de
// theme_taxonomy en db/schema.sql y subir PROMPT_VERSION.
export const THEME_LIST: { slug: string; nombre: string; descripcion: string }[] = [
  { slug: "politica-poder", nombre: "Política y poder", descripcion: "gobierno, Estado, elecciones, partidos, poder público" },
  { slug: "violencia", nombre: "Violencia", descripcion: "crimen, narco, guerra, desaparición, violencia de Estado o doméstica" },
  { slug: "justicia-derechos", nombre: "Justicia y derechos", descripcion: "derechos humanos, leyes, impunidad, activismo" },
  { slug: "migracion-frontera", nombre: "Migración y frontera", descripcion: "migrar, exilio, frontera, diáspora" },
  { slug: "ciudad-territorio", nombre: "Ciudad y territorio", descripcion: "la ciudad, el barrio, el paisaje, el lugar" },
  { slug: "memoria-historia", nombre: "Memoria e historia", descripcion: "pasado colectivo, archivo, historia nacional" },
  { slug: "familia", nombre: "Familia", descripcion: "padres, hijos, herencia, crianza, linaje" },
  { slug: "amor-deseo", nombre: "Amor y deseo", descripcion: "pareja, erotismo, enamoramiento, ruptura" },
  { slug: "duelo-muerte", nombre: "Duelo y muerte", descripcion: "pérdida, muerte, luto" },
  { slug: "cuerpo-salud", nombre: "Cuerpo y salud", descripcion: "cuerpo, enfermedad, salud mental, envejecimiento" },
  { slug: "identidad-genero", nombre: "Identidad y género", descripcion: "género, sexualidad, raza, clase como identidad" },
  { slug: "infancia", nombre: "Infancia", descripcion: "niñez, adolescencia, formación" },
  { slug: "trabajo-economia", nombre: "Trabajo y economía", descripcion: "dinero, empleo, precariedad, consumo" },
  { slug: "tecnologia", nombre: "Tecnología", descripcion: "internet, redes, inteligencia artificial, ciencia aplicada" },
  { slug: "naturaleza-ambiente", nombre: "Naturaleza y ambiente", descripcion: "animales, ecología, crisis climática" },
  { slug: "fe-espiritualidad", nombre: "Fe y espiritualidad", descripcion: "religión, lo sagrado, ritual, mística" },
  { slug: "literatura-escritura", nombre: "Literatura y escritura", descripcion: "leer, escribir, libros, el oficio, la lengua" },
  { slug: "arte-cultura", nombre: "Arte y cultura", descripcion: "artes visuales, cine, música, teatro, cultura popular" },
  { slug: "filosofia-ideas", nombre: "Filosofía e ideas", descripcion: "pensamiento, ética, conceptos, teoría" },
  { slug: "viaje", nombre: "Viaje", descripcion: "viajar, desplazamiento, extranjería" },
  { slug: "comida", nombre: "Comida", descripcion: "cocina, alimentación, sobremesa" },
  { slug: "deporte-juego", nombre: "Deporte y juego", descripcion: "deporte, futbol, juego, competencia" },
];

export const THEMES: Record<string, string> = Object.fromEntries(THEME_LIST.map((t) => [t.slug, t.nombre]));

// Versión de la guía (rúbricas, campos, vocabularios). Se guarda con cada
// análisis; si sube, GET /api/ingest/texts?faltan=1 vuelve a listar los
// posts analizados con una versión anterior.
export const PROMPT_VERSION = "lean-1";
