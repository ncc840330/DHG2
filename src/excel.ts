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

/**
 * One photographable piece. A row of qty 3 is three pieces, each with its own
 * photos, so the spreadsheet row and the task line are no longer the same thing.
 */
export type ImportLine = TaskRow & { unitIndex: number; unitCount: number };

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

/** Excel's text number format. */
const TEXT_FORMAT = "@";

/**
 * Every cell of the fillable block is created up front in Text format, the empty
 * ones included. A serial number typed into a General cell is read back as a
 * number — `4210000123456789` returns as 4.21E+15 and `0012` loses its zeroes —
 * and the operator only finds that out when the import mangles their file.
 */
function textFormatBlock(sheet: XLSX.WorkSheet, rowCount: number) {
  for (let row = 0; row < rowCount; row += 1) {
    for (let column = 0; column < TEMPLATE_HEADERS.length; column += 1) {
      const address = XLSX.utils.encode_cell({ r: row, c: column });
      const cell = (sheet[address] ?? { t: "s", v: "" }) as XLSX.CellObject;
      cell.t = "s";
      cell.v = cellText(cell.v);
      cell.z = TEXT_FORMAT;
      sheet[address] = cell;
    }
  }

  sheet["!ref"] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: rowCount - 1, c: TEMPLATE_HEADERS.length - 1 },
  });
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
  // The header plus every row a task can hold, so a file filled to the brim is
  // text all the way down.
  textFormatBlock(sheet, MAX_TASK_ROWS + 1);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Photo upload");
  // The shared string table writes the 3000 preformatted cells as proper string
  // cells rather than the inline kind Excel treats as cached formula results.
  XLSX.writeFile(workbook, "HWCheck_PhotoUpload_Template.xlsx", { bookSST: true });
}

/**
 * How many pieces a row is. Anything unreadable counts as one: a row that says
 * "2 pcs" is two photo lines, a row that says nothing is still one.
 */
export function unitCount(qty: string) {
  const digits = /\d+/.exec(qty);
  const count = digits ? Number.parseInt(digits[0], 10) : 1;
  return count > 1 ? Math.min(count, MAX_TASK_ROWS + 1) : 1;
}

/**
 * Photos are per piece, not per row: every unit of a qty needs its own two
 * shots, so a row of qty 3 becomes three task lines that each carry qty 1.
 */
export function expandByQty(rows: TaskRow[]): ImportLine[] {
  return rows.flatMap((row) => {
    const count = unitCount(row.qty);
    return Array.from({ length: count }, (_, index) => ({
      ...row,
      qty: "1",
      unitIndex: index + 1,
      unitCount: count,
    }));
  });
}

export type ParseResult =
  | { rows: TaskRow[]; lines: ImportLine[]; skippedRows: number }
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

    // Either identifier will do — plenty of items carry no serial number — but
    // something has to name the row, and a locator has to say where to go.
    if ((!values.item && !values.sn) || !values.locator) {
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
      error: `Hiányos sor a fájlban (Item vagy SN, és Locator kötelező): ${listed}${rest}.`,
    };
  }

  if (rows.length === 0) {
    return { error: "A fájlban nincs feltölthető sor." };
  }

  const lines = expandByQty(rows);

  if (lines.length > MAX_TASK_ROWS) {
    return {
      error: `Egy taskba legfeljebb ${MAX_TASK_ROWS} sor kerülhet, a fájl qty-val együtt ${lines.length} sort ad.`,
    };
  }

  return { rows, lines, skippedRows };
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
