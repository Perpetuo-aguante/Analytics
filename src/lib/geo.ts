// Normalización geográfica de los suscriptores.
//
// El export de Substack trae "Country" y "State/Province" como texto libre:
// según de dónde venga la fila puede decir "Spain", "España", "ES" o "es".
// Si se agrupa por el valor crudo, el mismo país aparece partido en varias
// barras y las tendencias quedan mal contadas. Por eso todo lo que agrupa
// por país pasa primero por `lookupCountry`, que resuelve código ISO-2,
// nombre en inglés y nombre en español al mismo registro canónico.
//
// El registro también dice a qué región del mundo pertenece cada país, que
// es el segundo nivel de la pregunta "¿de dónde vienen?": con ~4000
// suscriptores repartidos en decenas de países, el ranking de países dice
// quién es grande y el de regiones dice dónde está el público.
//
// Formato de la tabla: "ISO2|Nombre en español" y, cuando el inglés difiere,
// "ISO2|Nombre en español|Nombre en inglés". La región sale de la clave del
// grupo, no se repite en cada fila.

export type WorldRegion =
  | "Sudamérica"
  | "Centroamérica y Caribe"
  | "Norteamérica"
  | "Europa"
  | "Asia"
  | "África"
  | "Oceanía";

export const WORLD_REGIONS: WorldRegion[] = [
  "Sudamérica",
  "Centroamérica y Caribe",
  "Norteamérica",
  "Europa",
  "Asia",
  "África",
  "Oceanía",
];

// País presente en los datos pero fuera de la tabla (o escrito de una forma
// que no se pudo resolver) y suscriptor sin país declarado. Se muestran
// aparte en vez de mezclarse con una región real.
export const UNKNOWN_REGION = "Otra región" as const;
export const NO_COUNTRY_REGION = "Sin país" as const;
export const NO_COUNTRY_KEY = "sin-pais";
export const NO_COUNTRY_LABEL = "Sin país";

export type RegionLabel = WorldRegion | typeof UNKNOWN_REGION | typeof NO_COUNTRY_REGION;

// Orden fijo para los desgloses por región: las regiones reales en el orden
// de WORLD_REGIONS y los dos cajones de sobra siempre al final.
export const REGION_ORDER: RegionLabel[] = [...WORLD_REGIONS, UNKNOWN_REGION, NO_COUNTRY_REGION];

const COUNTRIES_BY_REGION: Record<WorldRegion, string[]> = {
  "Sudamérica": [
    "AR|Argentina",
    "BO|Bolivia",
    "BR|Brasil|Brazil",
    "CL|Chile",
    "CO|Colombia",
    "EC|Ecuador",
    "FK|Islas Malvinas|Falkland Islands",
    "GF|Guayana Francesa|French Guiana",
    "GY|Guyana",
    "PE|Perú|Peru",
    "PY|Paraguay",
    "SR|Surinam|Suriname",
    "UY|Uruguay",
    "VE|Venezuela",
  ],
  "Centroamérica y Caribe": [
    "AG|Antigua y Barbuda|Antigua and Barbuda",
    "AW|Aruba",
    "BB|Barbados",
    "BM|Bermudas|Bermuda",
    "BS|Bahamas",
    "BZ|Belice|Belize",
    "CR|Costa Rica",
    "CU|Cuba",
    "CW|Curazao|Curaçao",
    "DM|Dominica",
    "DO|República Dominicana|Dominican Republic",
    "GD|Granada|Grenada",
    "GP|Guadalupe|Guadeloupe",
    "GT|Guatemala",
    "HN|Honduras",
    "HT|Haití|Haiti",
    "JM|Jamaica",
    "KN|San Cristóbal y Nieves|Saint Kitts and Nevis",
    "KY|Islas Caimán|Cayman Islands",
    "LC|Santa Lucía|Saint Lucia",
    "MQ|Martinica|Martinique",
    "NI|Nicaragua",
    "PA|Panamá|Panama",
    "PR|Puerto Rico",
    "SV|El Salvador",
    "TC|Islas Turcas y Caicos|Turks and Caicos Islands",
    "TT|Trinidad y Tobago|Trinidad and Tobago",
    "VC|San Vicente y las Granadinas|Saint Vincent and the Grenadines",
    "VG|Islas Vírgenes Británicas|British Virgin Islands",
    "VI|Islas Vírgenes de EE. UU.|U.S. Virgin Islands",
  ],
  "Norteamérica": [
    "CA|Canadá|Canada",
    "GL|Groenlandia|Greenland",
    "MX|México|Mexico",
    "US|Estados Unidos|United States",
  ],
  "Europa": [
    "AD|Andorra",
    "AL|Albania",
    "AT|Austria",
    "AX|Islas Åland|Åland Islands",
    "BA|Bosnia y Herzegovina|Bosnia and Herzegovina",
    "BE|Bélgica|Belgium",
    "BG|Bulgaria",
    "BY|Bielorrusia|Belarus",
    "CH|Suiza|Switzerland",
    "CY|Chipre|Cyprus",
    "CZ|Chequia|Czechia",
    "DE|Alemania|Germany",
    "DK|Dinamarca|Denmark",
    "EE|Estonia",
    "ES|España|Spain",
    "FI|Finlandia|Finland",
    "FO|Islas Feroe|Faroe Islands",
    "FR|Francia|France",
    "GB|Reino Unido|United Kingdom",
    "GG|Guernsey",
    "GI|Gibraltar",
    "GR|Grecia|Greece",
    "HR|Croacia|Croatia",
    "HU|Hungría|Hungary",
    "IE|Irlanda|Ireland",
    "IM|Isla de Man|Isle of Man",
    "IS|Islandia|Iceland",
    "IT|Italia|Italy",
    "JE|Jersey",
    "LI|Liechtenstein",
    "LT|Lituania|Lithuania",
    "LU|Luxemburgo|Luxembourg",
    "LV|Letonia|Latvia",
    "MC|Mónaco|Monaco",
    "MD|Moldavia|Moldova",
    "ME|Montenegro",
    "MK|Macedonia del Norte|North Macedonia",
    "MT|Malta",
    "NL|Países Bajos|Netherlands",
    "NO|Noruega|Norway",
    "PL|Polonia|Poland",
    "PT|Portugal",
    "RO|Rumanía|Romania",
    "RS|Serbia",
    "RU|Rusia|Russia",
    "SE|Suecia|Sweden",
    "SI|Eslovenia|Slovenia",
    "SK|Eslovaquia|Slovakia",
    "SM|San Marino",
    "UA|Ucrania|Ukraine",
    "VA|Ciudad del Vaticano|Vatican City",
    "XK|Kosovo",
  ],
  "Asia": [
    "AE|Emiratos Árabes Unidos|United Arab Emirates",
    "AF|Afganistán|Afghanistan",
    "AM|Armenia",
    "AZ|Azerbaiyán|Azerbaijan",
    "BD|Bangladés|Bangladesh",
    "BH|Baréin|Bahrain",
    "BN|Brunéi|Brunei",
    "BT|Bután|Bhutan",
    "CN|China",
    "GE|Georgia",
    "HK|Hong Kong",
    "ID|Indonesia",
    "IL|Israel",
    "IN|India",
    "IQ|Irak|Iraq",
    "IR|Irán|Iran",
    "JO|Jordania|Jordan",
    "JP|Japón|Japan",
    "KG|Kirguistán|Kyrgyzstan",
    "KH|Camboya|Cambodia",
    "KP|Corea del Norte|North Korea",
    "KR|Corea del Sur|South Korea",
    "KW|Kuwait",
    "KZ|Kazajistán|Kazakhstan",
    "LA|Laos",
    "LB|Líbano|Lebanon",
    "LK|Sri Lanka",
    "MM|Birmania|Myanmar",
    "MN|Mongolia",
    "MO|Macao",
    "MV|Maldivas|Maldives",
    "MY|Malasia|Malaysia",
    "NP|Nepal",
    "OM|Omán|Oman",
    "PH|Filipinas|Philippines",
    "PK|Pakistán|Pakistan",
    "PS|Palestina|Palestine",
    "QA|Catar|Qatar",
    "SA|Arabia Saudita|Saudi Arabia",
    "SG|Singapur|Singapore",
    "SY|Siria|Syria",
    "TH|Tailandia|Thailand",
    "TJ|Tayikistán|Tajikistan",
    "TL|Timor Oriental|Timor-Leste",
    "TM|Turkmenistán|Turkmenistan",
    "TR|Turquía|Turkey",
    "TW|Taiwán|Taiwan",
    "UZ|Uzbekistán|Uzbekistan",
    "VN|Vietnam",
    "YE|Yemen",
  ],
  "África": [
    "AO|Angola",
    "BF|Burkina Faso",
    "BI|Burundi",
    "BJ|Benín|Benin",
    "BW|Botsuana|Botswana",
    "CD|República Democrática del Congo|DR Congo",
    "CF|República Centroafricana|Central African Republic",
    "CG|República del Congo|Republic of the Congo",
    "CI|Costa de Marfil|Côte d'Ivoire",
    "CM|Camerún|Cameroon",
    "CV|Cabo Verde|Cape Verde",
    "DJ|Yibuti|Djibouti",
    "DZ|Argelia|Algeria",
    "EG|Egipto|Egypt",
    "ER|Eritrea",
    "ET|Etiopía|Ethiopia",
    "GA|Gabón|Gabon",
    "GH|Ghana",
    "GM|Gambia",
    "GN|Guinea",
    "GQ|Guinea Ecuatorial|Equatorial Guinea",
    "GW|Guinea-Bisáu|Guinea-Bissau",
    "KE|Kenia|Kenya",
    "KM|Comoras|Comoros",
    "LR|Liberia",
    "LS|Lesoto|Lesotho",
    "LY|Libia|Libya",
    "MA|Marruecos|Morocco",
    "MG|Madagascar",
    "ML|Malí|Mali",
    "MR|Mauritania",
    "MU|Mauricio|Mauritius",
    "MW|Malaui|Malawi",
    "MZ|Mozambique",
    "NA|Namibia",
    "NE|Níger|Niger",
    "NG|Nigeria",
    "RE|Reunión|Réunion",
    "RW|Ruanda|Rwanda",
    "SC|Seychelles",
    "SD|Sudán|Sudan",
    "SL|Sierra Leona|Sierra Leone",
    "SN|Senegal",
    "SO|Somalia",
    "SS|Sudán del Sur|South Sudan",
    "ST|Santo Tomé y Príncipe|Sao Tome and Principe",
    "SZ|Esuatini|Eswatini",
    "TD|Chad",
    "TG|Togo",
    "TN|Túnez|Tunisia",
    "TZ|Tanzania",
    "UG|Uganda",
    "YT|Mayotte",
    "ZA|Sudáfrica|South Africa",
    "ZM|Zambia",
    "ZW|Zimbabue|Zimbabwe",
  ],
  "Oceanía": [
    "AS|Samoa Americana|American Samoa",
    "AU|Australia",
    "CK|Islas Cook|Cook Islands",
    "FJ|Fiyi|Fiji",
    "FM|Micronesia",
    "GU|Guam",
    "KI|Kiribati",
    "MH|Islas Marshall|Marshall Islands",
    "NC|Nueva Caledonia|New Caledonia",
    "NR|Nauru",
    "NZ|Nueva Zelanda|New Zealand",
    "PF|Polinesia Francesa|French Polynesia",
    "PG|Papúa Nueva Guinea|Papua New Guinea",
    "PW|Palaos|Palau",
    "SB|Islas Salomón|Solomon Islands",
    "TO|Tonga",
    "TV|Tuvalu",
    "VU|Vanuatu",
    "WS|Samoa",
  ],
};

// Formas alternativas que aparecen en exports reales y no son ni el nombre
// oficial en inglés ni el nombre en español. Se resuelven al mismo ISO-2.
const ALIASES: Record<string, string> = {
  usa: "US",
  us: "US",
  "u s a": "US",
  "united states of america": "US",
  "estados unidos de america": "US",
  eeuu: "US",
  uk: "GB",
  "great britain": "GB",
  england: "GB",
  inglaterra: "GB",
  scotland: "GB",
  escocia: "GB",
  wales: "GB",
  gales: "GB",
  "northern ireland": "GB",
  "russian federation": "RU",
  "czech republic": "CZ",
  "republica checa": "CZ",
  holland: "NL",
  holanda: "NL",
  "the netherlands": "NL",
  turkiye: "TR",
  "viet nam": "VN",
  "ivory coast": "CI",
  "korea republic of": "KR",
  "republic of korea": "KR",
  "south korea": "KR",
  "korea democratic peoples republic of": "KP",
  burma: "MM",
  "myanmar burma": "MM",
  "cape verde": "CV",
  swaziland: "SZ",
  macedonia: "MK",
  "hong kong sar china": "HK",
  "macao sar china": "MO",
  "taiwan province of china": "TW",
  "vatican": "VA",
  "holy see": "VA",
  "bolivia plurinational state of": "BO",
  "venezuela bolivarian republic of": "VE",
  "iran islamic republic of": "IR",
  "tanzania united republic of": "TZ",
  "syrian arab republic": "SY",
  "lao peoples democratic republic": "LA",
  "brunei darussalam": "BN",
  "cote divoire": "CI",
  "congo kinshasa": "CD",
  "congo brazzaville": "CG",
  "democratic republic of the congo": "CD",
  "republica dominicana": "DO",
};

export type CountryInfo = {
  /** ISO-3166-1 alfa-2, la clave estable con la que se agrupa. */
  code: string;
  /** Nombre en español, que es lo que se muestra. */
  name: string;
  region: WorldRegion;
};

// Quita acentos, signos y dobles espacios: "Côte d'Ivoire", "cote d ivoire"
// y "COTE DIVOIRE" caen todos en la misma clave.
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const BY_CODE = new Map<string, CountryInfo>();
const BY_NAME = new Map<string, CountryInfo>();

for (const region of WORLD_REGIONS) {
  for (const entry of COUNTRIES_BY_REGION[region]) {
    const [code, spanish, english] = entry.split("|");
    const info: CountryInfo = { code, name: spanish, region };
    BY_CODE.set(code.toLowerCase(), info);
    BY_NAME.set(normalize(spanish), info);
    if (english) BY_NAME.set(normalize(english), info);
  }
}

for (const [alias, code] of Object.entries(ALIASES)) {
  const info = BY_CODE.get(code.toLowerCase());
  if (info) BY_NAME.set(normalize(alias), info);
}

/** Resuelve el valor crudo de `country` a un país conocido, o null. */
export function lookupCountry(raw: string | null | undefined): CountryInfo | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Un código ISO-2 ("ES") se distingue de un nombre por la longitud: solo
  // se prueba contra la tabla de códigos si tiene exactamente dos letras.
  if (/^[A-Za-z]{2}$/.test(trimmed)) {
    const byCode = BY_CODE.get(trimmed.toLowerCase());
    if (byCode) return byCode;
  }
  return BY_NAME.get(normalize(trimmed)) ?? null;
}

/**
 * Clave estable para agrupar. Un país conocido se agrupa por su ISO-2; uno
 * desconocido, por su texto normalizado (así al menos "Wakanda" y "wakanda "
 * caen juntos); sin país, por una clave reservada.
 */
export function countryKey(raw: string | null | undefined): string {
  const info = lookupCountry(raw);
  if (info) return info.code;
  const normalized = raw ? normalize(raw) : "";
  return normalized ? `otro:${normalized}` : NO_COUNTRY_KEY;
}

/** Nombre a mostrar: el español si se conoce el país, si no el texto crudo. */
export function countryLabel(raw: string | null | undefined): string {
  const info = lookupCountry(raw);
  if (info) return info.name;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : NO_COUNTRY_LABEL;
}

export function countryRegion(raw: string | null | undefined): RegionLabel {
  const info = lookupCountry(raw);
  if (info) return info.region;
  return raw?.trim() ? UNKNOWN_REGION : NO_COUNTRY_REGION;
}

/** True si dos valores crudos de país son el mismo país. */
export function sameCountry(a: string | null | undefined, b: string | null | undefined): boolean {
  return countryKey(a) === countryKey(b);
}
