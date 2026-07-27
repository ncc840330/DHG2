import * as XLSX from "xlsx";

/**
 * The spreadsheet side of a photo upload task. The operator gets the format from
 * the TEMPLATE button and hands the filled file back through IMPORT EXCEL, so
 * both the layout and the reading of it live together here.
 */

export const WAREHOUSE_CODE = "FXN-GYOR";

export const MAX_TASK_ROWS = 500;

export type TaskRow = {
  item: string;
  sn: string;
  qty: string;
  warehouseCode: string;
  subinvCode: string;
  locator: string;
};

export const TEMPLATE_HEADERS = [
  "Item",
  "SN",
  "Qty",
  "Warehouse Code",
  "Subinv Code",
  "Locator",
];

/**
 * Column order is the template's, but a file is read by header name — an export
 * from another system rarely lines its columns up the same way, and a shifted
 * column would otherwise become an SN full of quantities.
 */
const COLUMN_ALIASES: { field: keyof TaskRow; names: string[] }[] = [
  { field: "item", names: ["item", "itemcode", "itemnumber", "systemitem"] },
  { field: "sn", names: ["sn", "serialnumber", "serial", "systemsn"] },
  { field: "qty", names: ["qty", "quantity", "pcs"] },
  { field: "warehouseCode", names: ["warehousecode", "warehouse", "whcode"] },
  { field: "subinvCode", names: ["subinvcode", "subinventorycode", "subinv"] },
  { field: "locator", names: ["locator", "location", "subinvlocator"] },
];

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function cellText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

/** Builds the empty task file: the six columns, with the warehouse prefilled. */
export function downloadTemplate() {
  const sheet = XLSX.utils.aoa_to_sheet([
    TEMPLATE_HEADERS,
    ["", "", "1", WAREHOUSE_CODE, "", ""],
  ]);
  sheet["!cols"] = [
    { wch: 18 },
    { wch: 26 },
    { wch: 8 },
    { wch: 18 },
    { wch: 16 },
    { wch: 18 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Photo upload");
  XLSX.writeFile(workbook, "HWCheck_PhotoUpload_Template.xlsx");
}

export type ParseResult =
  | { rows: TaskRow[]; skippedRows: number }
  | { error: string };

/**
 * Reads the uploaded workbook into task rows. Anything it cannot make a
 * photographable line out of is reported with its spreadsheet row number, so
 * the operator can fix the file rather than guess at what the app disliked.
 */
export async function parseTaskFile(file: File): Promise<ParseResult> {
  let grid: unknown[][];

  try {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const sheetName = workbook.SheetNames[0];
    const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
    if (!sheet) return { error: "A fájlban nincs munkalap." };

    grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: false,
      defval: "",
      blankrows: false,
    });
  } catch {
    return { error: "A fájl nem olvasható, .xlsx vagy .xls formátum kell." };
  }

  const hasColumn = (headers: string[], field: keyof TaskRow) => {
    const names = COLUMN_ALIASES.find((column) => column.field === field)?.names ?? [];
    return headers.some((header) => names.includes(header));
  };

  // The header is looked for instead of assumed on row 1: exports often carry a
  // title or a filter line above the grid. It is recognised by the same aliases
  // the columns are read with, so "Item code" heads a file just as "Item" does.
  const headerIndex = grid.findIndex((row) => {
    const headers = row.map(normalizeHeader);
    return hasColumn(headers, "item") && hasColumn(headers, "sn");
  });

  if (headerIndex < 0) {
    return {
      error: "Nem találom az Item és SN oszlopot. Töltsd le a TEMPLATE fájlt.",
    };
  }

  const headers = grid[headerIndex].map(normalizeHeader);
  const columns = new Map<keyof TaskRow, number>();
  COLUMN_ALIASES.forEach(({ field, names }) => {
    const index = headers.findIndex((header) => names.includes(header));
    if (index >= 0) columns.set(field, index);
  });

  const missing = (["item", "sn", "locator"] as const).filter(
    (field) => !columns.has(field),
  );
  if (missing.length > 0) {
    return {
      error: `Hiányzó oszlop a fájlban: ${missing
        .map((field) => (field === "sn" ? "SN" : field === "item" ? "Item" : "Locator"))
        .join(", ")}.`,
    };
  }

  const read = (row: unknown[], field: keyof TaskRow) => {
    const index = columns.get(field);
    return index === undefined ? "" : cellText(row[index]);
  };

  const rows: TaskRow[] = [];
  const invalidRows: number[] = [];
  let skippedRows = 0;

  for (let index = headerIndex + 1; index < grid.length; index += 1) {
    const row = grid[index];
    const values = {
      item: read(row, "item"),
      sn: read(row, "sn"),
      qty: read(row, "qty") || "1",
      warehouseCode: read(row, "warehouseCode") || WAREHOUSE_CODE,
      subinvCode: read(row, "subinvCode"),
      locator: read(row, "locator"),
    };

    // A wholly empty line is the end of the grid or a spacer, not an error.
    if (!values.item && !values.sn && !values.locator && !values.subinvCode) {
      skippedRows += 1;
      continue;
    }

    if (!values.item || !values.sn || !values.locator) {
      invalidRows.push(index + 1);
      continue;
    }

    rows.push(values);
  }

  if (invalidRows.length > 0) {
    const listed = invalidRows.slice(0, 5).join(", ");
    const rest =
      invalidRows.length > 5 ? ` és további ${invalidRows.length - 5} sor` : "";
    return {
      error: `Hiányos sor a fájlban (Item, SN és Locator kötelező): ${listed}${rest}.`,
    };
  }

  if (rows.length === 0) {
    return { error: "A fájlban nincs feltölthető sor." };
  }

  if (rows.length > MAX_TASK_ROWS) {
    return {
      error: `Egy taskba legfeljebb ${MAX_TASK_ROWS} sor kerülhet, a fájlban ${rows.length} van.`,
    };
  }

  return { rows, skippedRows };
}

/** Photo work is walked location by location, so the rows are grouped that way. */
export function groupByLocator<T extends { locator: string }>(lines: T[]) {
  const groups = new Map<string, T[]>();

  lines.forEach((line) => {
    const key = line.locator || "—";
    const group = groups.get(key);
    if (group) group.push(line);
    else groups.set(key, [line]);
  });

  return Array.from(groups, ([locator, items]) => ({ locator, items }));
}
