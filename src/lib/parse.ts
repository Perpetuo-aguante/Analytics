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

function parseCsv(buffer: Buffer): ParsedSheet {
  const text = buffer.toString("utf-8");
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
