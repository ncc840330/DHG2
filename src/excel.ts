import * as XLSX from "xlsx";
import { SEAL_TEMPLATE_URL } from "./task-forms";
import type { RowValues } from "./task-forms";

/**
 * The spreadsheet side of a HW check task. The operator gets the format from the
 * TEMPLATE button and hands the filled file back through IMPORT EXCEL, so both
 * the layout and the reading of it live together here. Photo upload has a
 * template this file writes; the yellow seal check has the warehouse's own
 * printed sheet, which is shipped as it is and only read back.
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

/** The first worksheet as a grid of strings, or why it could not be read. */
async function readGrid(file: File): Promise<{ grid: unknown[][] } | { error: string }> {
  try {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const sheetName = workbook.SheetNames[0];
    const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
    if (!sheet) return { error: "A fájlban nincs munkalap." };

    return {
      grid: XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        raw: false,
        defval: "",
        blankrows: false,
      }),
    };
  } catch {
    return { error: "A fájl nem olvasható, .xlsx vagy .xls formátum kell." };
  }
}

/**
 * Reads the uploaded workbook into task rows. Anything it cannot make a
 * photographable line out of is reported with its spreadsheet row number, so
 * the operator can fix the file rather than guess at what the app disliked.
 */
export async function parseTaskFile(file: File): Promise<ParseResult> {
  const loaded = await readGrid(file);
  if ("error" in loaded) return { error: loaded.error };
  const grid = loaded.grid;

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

/**
 * The yellow seal check sheet. Its columns are read by name like the photo
 * upload's, but its header is two storeys tall: one merged heading over an OK
 * and a NO column. Both spellings are accepted — the warehouse's own sheet with
 * the two columns, and an export that answers Pass or Fail in a single one.
 */
const SEAL_ALIASES: { field: keyof SealRow; names: string[] }[] = [
  {
    field: "subinvCode",
    names: ["fromsubinv", "subinv", "subinvcode", "fromsubinventory", "subinventory"],
  },
  { field: "locator", names: ["locator", "location", "subinvlocator"] },
  { field: "item", names: ["item", "itemcode", "itemnumber", "systemitem"] },
  // The sheet calls it Bar Code and it holds the serial number, so both spellings
  // land in the same column: there is no separate SN.
  {
    field: "barcode",
    names: [
      "barcode",
      "code",
      "boxbarcode",
      "labelbarcode",
      "sn",
      "serialnumber",
      "serial",
      "systemsn",
    ],
  },
  { field: "remark", names: ["remark", "remarks", "comment", "note", "megjegyzes"] },
];

const sealAliases = (field: keyof SealRow) =>
  SEAL_ALIASES.find((alias) => alias.field === field)?.names ?? [];

/** A single-column answer, for a file that does not use the OK/NO pair. */
const SEAL_ANSWER_NAMES = [
  "seallabelintact",
  "sealintact",
  "sealresult",
  "seal",
  "whethertheoriginalsealisintact",
];

const CHECKED_BY_NAMES = ["checkedby", "checked"];
const CONFIRMED_BY_NAMES = ["confirmedby", "confirmed"];
const SIGNATURE_NAMES = ["signature", "sign", "alairas"];

const PASS_WORDS = ["pass", "ok", "yes", "intact", "igen", "x", "1", "true"];
const FAIL_WORDS = ["fail", "no", "nook", "notok", "broken", "nem", "0", "false"];

export type SealRow = {
  subinvCode: string;
  locator: string;
  item: string;
  /** The sheet's Bar Code column, which is the serial number. */
  barcode: string;
  sealResult: string;
  remark: string;
};

/** Who checked and who confirmed, as the sheet writes it once at the top. */
export type SealHeader = {
  checkedBy: string;
  confirmedBy: string;
  signature: string;
};

function normalizedWord(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export type SealParseResult =
  | { rows: SealRow[]; header: SealHeader; skippedRows: number }
  | { error: string };

export function parseSealGrid(grid: unknown[][]): SealParseResult {
  const headerIndex = grid.findIndex((row) => {
    const headers = row.map(normalizeHeader);
    const hasSubinv = headers.some((header) =>
      sealAliases("subinvCode").includes(header),
    );
    const hasSn = headers.some((header) => sealAliases("barcode").includes(header));
    return hasSubinv && hasSn;
  });

  if (headerIndex < 0) {
    return {
      error:
        "Nem találom a From Subinv és az SN (Bar Code) oszlopot. Töltsd le a TEMPLATE fájlt.",
    };
  }

  const headers = grid[headerIndex].map(normalizeHeader);
  const columns = new Map<keyof SealRow, number>();
  SEAL_ALIASES.forEach(({ field, names }) => {
    const index = headers.findIndex((header) => names.includes(header));
    if (index >= 0) columns.set(field, index);
  });

  const named = (names: string[]) => headers.findIndex((h) => names.includes(h));
  const header: SealHeader = { checkedBy: "", confirmedBy: "", signature: "" };
  const headerColumns = {
    checkedBy: named(CHECKED_BY_NAMES),
    confirmedBy: named(CONFIRMED_BY_NAMES),
    signature: named(SIGNATURE_NAMES),
  };

  // The template's OK and NO sit on the row below the merged heading, so that
  // row is a second storey of the header rather than the first box to check.
  const second = (grid[headerIndex + 1] ?? []).map(normalizedWord);
  const okColumn = second.findIndex((value) => value === "ok");
  const noColumn = second.findIndex((value) => value === "no" || value === "nook");
  const hasPair = okColumn >= 0 && noColumn >= 0;
  const answerColumn = headers.findIndex((h) => SEAL_ANSWER_NAMES.includes(h));

  const missing: string[] = [];
  if (!columns.has("locator")) missing.push("Locator");
  if (!columns.has("item")) missing.push("Item");
  if (missing.length > 0) {
    return { error: `Hiányzó oszlop a fájlban: ${missing.join(", ")}.` };
  }

  const value = (row: unknown[], field: keyof SealRow) => {
    const index = columns.get(field);
    return index === undefined ? "" : cellText(row[index]);
  };
  const at = (row: unknown[], index: number) =>
    index < 0 ? "" : cellText(row[index]);

  const rows: SealRow[] = [];
  const invalidRows: number[] = [];
  const contradictoryRows: number[] = [];
  let skippedRows = 0;

  for (let index = headerIndex + (hasPair ? 2 : 1); index < grid.length; index += 1) {
    const row = grid[index];
    const values: SealRow = {
      subinvCode: value(row, "subinvCode"),
      locator: value(row, "locator"),
      item: value(row, "item"),
      barcode: value(row, "barcode"),
      sealResult: "",
      remark: value(row, "remark"),
    };

    // A template hands out numbered but otherwise empty rows, and the numbering
    // alone is not a box to check.
    const hasContent =
      values.subinvCode || values.locator || values.item || values.barcode;
    if (!hasContent) {
      skippedRows += 1;
      continue;
    }

    if (!values.subinvCode || !values.locator || !values.item || !values.barcode) {
      invalidRows.push(index + 1);
      continue;
    }

    if (hasPair) {
      const isPass = at(row, okColumn).trim().length > 0;
      const isFail = at(row, noColumn).trim().length > 0;
      if (isPass && isFail) contradictoryRows.push(index + 1);
      else if (isPass) values.sealResult = "pass";
      else if (isFail) values.sealResult = "fail";
    } else if (answerColumn >= 0) {
      const word = normalizedWord(at(row, answerColumn));
      if (PASS_WORDS.includes(word)) values.sealResult = "pass";
      else if (FAIL_WORDS.includes(word)) values.sealResult = "fail";
    }

    // The names are written once, at the top of the sheet, and every printed row
    // repeats them — so the first row that carries them speaks for the task.
    if (!header.checkedBy) header.checkedBy = at(row, headerColumns.checkedBy);
    if (!header.confirmedBy) header.confirmedBy = at(row, headerColumns.confirmedBy);
    if (!header.signature) header.signature = at(row, headerColumns.signature);

    rows.push(values);
  }

  if (invalidRows.length > 0) {
    return {
      error: `Hiányos sor a fájlban (From Subinv, Locator, Item és SN kötelező): ${listRows(
        invalidRows,
      )}.`,
    };
  }
  if (contradictoryRows.length > 0) {
    return {
      error: `Az OK és a NO oszlop is ki van töltve: ${listRows(contradictoryRows)}.`,
    };
  }
  if (rows.length === 0) return { error: "A fájlban nincs ellenőrizhető sor." };
  if (rows.length > MAX_TASK_ROWS) {
    return {
      error: `Egy taskba legfeljebb ${MAX_TASK_ROWS} sor kerülhet, a fájl ${rows.length} sort ad.`,
    };
  }

  return { rows, header, skippedRows };
}

function listRows(numbers: number[]) {
  const listed = numbers.slice(0, 5).join(", ");
  return numbers.length > 5
    ? `${listed} és további ${numbers.length - 5} sor`
    : listed;
}

/**
 * One row as the app will work it: the values the server is sent, plus which
 * piece of an imported qty it is. Photo upload splits a qty into pieces, the
 * yellow seal check treats every row as the one box it names.
 */
export type PreviewLine = {
  values: RowValues;
  unitIndex: number;
  unitCount: number;
};

export type ImportOutcome =
  | {
      rows: RowValues[];
      lines: PreviewLine[];
      header: RowValues;
      skippedRows: number;
    }
  | { error: string };

/** Reads a file the way the picked task type spells its columns. */
export async function parseImportFile(
  taskType: string,
  file: File,
): Promise<ImportOutcome> {
  if (taskType === "yellow-seal") {
    const loaded = await readGrid(file);
    if ("error" in loaded) return { error: loaded.error };

    const parsed = parseSealGrid(loaded.grid);
    if ("error" in parsed) return { error: parsed.error };

    const rows = parsed.rows.map<RowValues>((row) => ({ ...row }));

    return {
      rows,
      lines: expandRows(taskType, rows),
      header: { ...parsed.header },
      skippedRows: parsed.skippedRows,
    };
  }

  const parsed = await parseTaskFile(file);
  if ("error" in parsed) return { error: parsed.error };

  const rows = parsed.rows.map<RowValues>((row) => ({ ...row }));

  return {
    rows,
    lines: expandRows(taskType, rows),
    header: {},
    skippedRows: parsed.skippedRows,
  };
}

/** The same splitting the server does, so the preview counts what it will hold. */
export function expandRows(taskType: string, rows: RowValues[]): PreviewLine[] {
  if (taskType !== "photo-upload") {
    return rows.map((values) => ({ values, unitIndex: 1, unitCount: 1 }));
  }

  return rows.flatMap((values) => {
    const count = unitCount(values.qty ?? "");
    return Array.from({ length: count }, (_, index) => ({
      values: { ...values, qty: "1" },
      unitIndex: index + 1,
      unitCount: count,
    }));
  });
}

/**
 * The TEMPLATE button. Photo upload's is written here; the yellow seal check
 * hands out the warehouse's own sheet, logo, print setup and all, so it is
 * shipped as a file and only downloaded.
 */
export function downloadTaskTemplate(taskType: string) {
  if (taskType !== "yellow-seal") {
    downloadTemplate();
    return;
  }

  const link = document.createElement("a");
  link.href = SEAL_TEMPLATE_URL;
  link.download = "YELLOW SEAL check template.xlsx";
  document.body.appendChild(link);
  link.click();
  link.remove();
}
