import { gunzipSync } from "node:zlib";
import ExcelJS from "exceljs";
import Papa from "papaparse";
import { cellToString } from "./format";

export type ParsedSheet = {
  headers: string[];
  rows: Record<string, unknown>[];
};

const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8MB

export async function parseUploadedFile(file: File): Promise<ParsedSheet> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("El archivo supera el límite de 8MB.");
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const isCsv = file.name.toLowerCase().endsWith(".csv") || file.type === "text/csv";
  return isCsv ? parseCsv(buffer) : parseXlsx(buffer);
}

// Máximo ya descomprimido para la API de ingesta (un export de 50.000
// suscriptores con ~40 columnas ronda los 20MB).
const MAX_DECOMPRESSED_BYTES = 60 * 1024 * 1024;

// Para la API de ingesta: detecta el formato por el contenido en vez de por
// el nombre del archivo. Acepta CSV, .xlsx (zip) y cualquiera de los dos
// comprimido con gzip.
export async function parseSheetBuffer(input: Buffer): Promise<ParsedSheet> {
  let buffer = input;
  if (buffer[0] === 0x1f && buffer[1] === 0x8b) {
    buffer = gunzipSync(buffer, { maxOutputLength: MAX_DECOMPRESSED_BYTES });
  }
  if (buffer.length > MAX_DECOMPRESSED_BYTES) throw new Error("El archivo es demasiado grande.");
  const isXlsx = buffer[0] === 0x50 && buffer[1] === 0x4b;
  return isXlsx ? parseXlsx(buffer) : parseCsv(buffer);
}

// Excel y algunos exports guardan el CSV con BOM: sin quitarlo, el primer
// encabezado no matchea ("\uFEFFEmail" ≠ "Email").
function stripBom(buffer: Buffer): Buffer {
  return buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf ? buffer.subarray(3) : buffer;
}

function parseCsv(buffer: Buffer): ParsedSheet {
  const text = stripBom(buffer).toString("utf-8");
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });
  const headers = (result.meta.fields ?? []).filter(Boolean);
  return { headers, rows: result.data };
}

async function parseXlsx(buffer: Buffer): Promise<ParsedSheet> {
  const workbook = new ExcelJS.Workbook();
  // exceljs trae su propia copia (más vieja) de los tipos de Node, cuyo
  // tipo Buffer no coincide estructuralmente con el de este proyecto aunque
  // en tiempo de ejecución sea el mismo objeto. De ahí el cast.
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("El archivo no tiene ninguna hoja.");

  // Guardamos los encabezados por posición de columna (con huecos si hay
  // columnas vacías) para poder alinear cada fila por índice.
  const rawHeaders: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
    rawHeaders[colNumber - 1] = cellToString(cell.value) ?? "";
  });

  const rows: Record<string, unknown>[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const record: Record<string, unknown> = {};
    let hasValue = false;
    rawHeaders.forEach((header, idx) => {
      if (!header) return;
      const value = row.getCell(idx + 1).value;
      record[header] = value;
      if (value != null && value !== "") hasValue = true;
    });
    if (hasValue) rows.push(record);
  });

  return { headers: rawHeaders.filter(Boolean), rows };
}
