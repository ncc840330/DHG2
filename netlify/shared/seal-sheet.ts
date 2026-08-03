/**
 * The printed yellow seal check sheet. The layout is the warehouse's own Excel
 * template — the same eleven columns in the same order and the same relative
 * widths — because the finished sheet is printed, signed and filed next to the
 * ones that came out of Excel. The template names who checked and who confirmed
 * once, at the top of the file; every printed row repeats those, so a page torn
 * out of the middle still says whose work it is. The third of that trio, the
 * signature on J3, is a picture rather than a name — it is stamped into the rows
 * the same way.
 */

import { formatSheetDate } from "./export.js";
import {
  buildPdf,
  fitText,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  type PdfLine,
  type PdfPage,
  type PdfStamp,
  type PdfText,
  pngImage,
  wrapText,
} from "./pdf.js";
import { SEAL_SIGNATURE_PNG } from "./seal-signature.js";

export type SealSheetLine = {
  rowIndex: number;
  subinvCode: string;
  locator: string;
  item: string;
  /** The template's Bar Code column, which is the serial number. */
  barcode: string;
  sealResult: string;
  remark: string;
};

export type SealSheetTask = {
  taskCode: string;
  recordDate: string | Date;
  checkedBy: string;
  confirmedBy: string;
  signature: string;
  lines: SealSheetLine[];
};

/** The widths are the template's own column widths, in Excel characters. */
const COLUMNS = [
  { key: "no", label: "No.", width: 4.14, align: "center" as const },
  { key: "subinv", label: "From Subinv", width: 12.57, align: "left" as const },
  { key: "locator", label: "Locator", width: 9.29, align: "left" as const },
  { key: "item", label: "Item", width: 10.57, align: "left" as const },
  // The template heads this column Bar Code; it holds the serial number, and the
  // app calls it SN, so the printed sheet says SN too.
  { key: "barcode", label: "SN", width: 23.57, align: "left" as const },
  { key: "ok", label: "OK", width: 6.29, align: "center" as const },
  { key: "no-ok", label: "NO", width: 6.43, align: "center" as const },
  { key: "checked", label: "Checked BY", width: 11.57, align: "left" as const },
  { key: "confirmed", label: "Confirmed BY", width: 11.14, align: "left" as const },
  { key: "signature", label: "Signature", width: 10.86, align: "left" as const },
  { key: "remark", label: "Remark", width: 13.71, align: "left" as const },
];

/** The seal answer lives under one heading split into an OK and a NO column. */
const SEAL_HEADING = "Whether The Original Seal Is Intact?";
const SEAL_COLUMNS = ["ok", "no-ok"];

const MARGIN_X = 22;
const TABLE_TOP = PAGE_HEIGHT - 96;
const TABLE_BOTTOM = 42;
const HEADER_HEIGHT = 34;
const ROW_HEIGHT = 15;
const CELL_PADDING = 3;

const HEADER_SIZE = 6;
const BODY_SIZE = 7;
const SMALL_SIZE = 5.5;
const SMALL_LEADING = 6.2;

/** A remark is a sentence or two, and the row grows to hold all of it. */
const MAX_REMARK_LINES = 4;

/**
 * The signature the template carries on J3. It is a picture rather than text, so
 * it is stamped into the Signature cell instead of written there — the same rule
 * the sheet follows for H3 and I3, which are copied into every row as words.
 *
 * It is stored upright, the name written up the page, and Excel lays it along the
 * row with a quarter turn; the sheet does the same. The template shows it about 55
 * points long, which is wider than the printed Signature column, so the column is
 * what decides in the end and the height follows from the picture's own shape.
 */
const SIGNATURE = pngImage(SEAL_SIGNATURE_PNG);

const SIGNATURE_MAX_WIDTH = 55.1;

/** How many single-line rows a page takes, which is what most sheets are. */
export const ROWS_PER_PAGE = Math.floor(
  (TABLE_TOP - HEADER_HEIGHT - TABLE_BOTTOM) / ROW_HEIGHT,
);

const AVAILABLE_HEIGHT = TABLE_TOP - HEADER_HEIGHT - TABLE_BOTTOM;

const TABLE_WIDTH = PAGE_WIDTH - MARGIN_X * 2;

/** Column edges in points, scaled from the template's character widths. */
function columnGeometry() {
  const total = COLUMNS.reduce((sum, column) => sum + column.width, 0);
  let x = MARGIN_X;

  return COLUMNS.map((column) => {
    const width = (column.width / total) * TABLE_WIDTH;
    const cell = { ...column, x, width, textWidth: width - CELL_PADDING * 2 };
    x += width;
    return cell;
  });
}

type Cell = ReturnType<typeof columnGeometry>[number];

function cellText(cell: Cell, text: string, y: number, size: number, bold = false) {
  const x =
    cell.align === "center" ? cell.x + cell.width / 2 : cell.x + CELL_PADDING;

  return {
    text: fitText(text, cell.textWidth, size, bold),
    x,
    y,
    size,
    bold,
    align: cell.align,
  } satisfies PdfText;
}

function pageTitle(task: SealSheetTask, page: number, pageCount: number) {
  const texts: PdfText[] = [
    {
      text: "Yellow seal check",
      x: PAGE_WIDTH / 2,
      y: PAGE_HEIGHT - 46,
      size: 15,
      bold: true,
      align: "center",
    },
    {
      text: `${task.taskCode}   ·   Date: ${formatSheetDate(task.recordDate)}`,
      x: PAGE_WIDTH / 2,
      y: PAGE_HEIGHT - 62,
      size: 8,
      align: "center",
    },
    {
      text: `${page}/${pageCount}`,
      x: MARGIN_X,
      y: PAGE_HEIGHT - 76,
      size: 7,
    },
  ];

  // Normally nobody names the signers: the sheet is signed after printing, and
  // the table keeps the columns for it. Saying "Checked by —" up here would only
  // put a dash where a name is not missing so much as not yet written.
  if (task.checkedBy) {
    texts.push({
      text: `Checked by ${task.checkedBy}`,
      x: PAGE_WIDTH - MARGIN_X,
      y: PAGE_HEIGHT - 76,
      size: 7,
      align: "right",
    });
  }
  if (task.confirmedBy) {
    texts.push({
      text: `Confirmed by ${task.confirmedBy}`,
      x: PAGE_WIDTH - MARGIN_X,
      y: PAGE_HEIGHT - 86,
      size: 7,
      align: "right",
    });
  }

  return texts;
}

/** The two-storey header: one heading over OK and NO, one cell for the rest. */
function tableHeader(cells: Cell[]) {
  const texts: PdfText[] = [];
  const lines: PdfLine[] = [];
  const top = TABLE_TOP;
  const bottom = TABLE_TOP - HEADER_HEIGHT;
  const middle = bottom + HEADER_HEIGHT / 2;

  const sealCells = cells.filter((cell) => SEAL_COLUMNS.includes(cell.key));
  const sealLeft = sealCells[0];
  const sealRight = sealCells[sealCells.length - 1];
  const sealWidth =
    sealRight.x + sealRight.width - sealLeft.x - CELL_PADDING * 2;

  wrapText(SEAL_HEADING, sealWidth, SMALL_SIZE, 3, true).forEach((line, index) => {
    texts.push({
      text: line,
      x: sealLeft.x + (sealRight.x + sealRight.width - sealLeft.x) / 2,
      y: top - 7 - index * 5.5,
      size: SMALL_SIZE,
      bold: true,
      align: "center",
    });
  });

  lines.push({
    x1: sealLeft.x,
    y1: middle,
    x2: sealRight.x + sealRight.width,
    y2: middle,
  });

  for (const cell of cells) {
    if (SEAL_COLUMNS.includes(cell.key)) {
      texts.push(cellText(cell, cell.label, middle - 11, HEADER_SIZE, true));
      continue;
    }

    const wrapped = wrapText(cell.label, cell.textWidth, HEADER_SIZE, 2, true);
    const firstBaseline =
      bottom + HEADER_HEIGHT / 2 - 2 + ((wrapped.length - 1) * 7) / 2;
    wrapped.forEach((line, index) => {
      texts.push({
        ...cellText(cell, line, firstBaseline - index * 7, HEADER_SIZE, true),
      });
    });
  }

  return { texts, lines, bottom };
}

/** The remark as it will be printed, and how tall that makes the row. */
function remarkLines(cells: Cell[], remark: string) {
  const cell = cells.find((item) => item.key === "remark");
  if (!cell || !remark) return [];
  return wrapText(remark, cell.textWidth, SMALL_SIZE, MAX_REMARK_LINES);
}

function rowHeight(cells: Cell[], line: SealSheetLine) {
  const lines = remarkLines(cells, line.remark).length;
  return Math.max(ROW_HEIGHT, lines * SMALL_LEADING + 6);
}

function rowTexts(cells: Cell[], line: SealSheetLine, task: SealSheetTask, top: number) {
  const texts: PdfText[] = [];
  const single = top - 10;

  const byKey = new Map(cells.map((cell) => [cell.key, cell]));
  const put = (key: string, text: string, y = single, size = BODY_SIZE) => {
    const cell = byKey.get(key);
    if (!cell || !text) return;
    texts.push(cellText(cell, text, y, size));
  };

  put("no", String(line.rowIndex));
  put("subinv", line.subinvCode);
  put("locator", line.locator);
  put("item", line.item);
  put("checked", task.checkedBy);
  put("confirmed", task.confirmedBy);
  put("signature", task.signature);

  // A pass is a tick in OK, a fail a tick in NO. Nothing is ticked twice.
  put("ok", line.sealResult === "pass" ? "X" : "");
  put("no-ok", line.sealResult === "fail" ? "X" : "");

  // The serial number is what identifies the box on the shelf, and it is the only
  // thing this column holds.
  put("barcode", line.barcode);

  const remark = remarkLines(cells, line.remark);
  if (remark.length === 1) put("remark", remark[0], single, SMALL_SIZE);
  else {
    remark.forEach((text, index) => {
      put("remark", text, top - 6.5 - index * SMALL_LEADING, SMALL_SIZE);
    });
  }

  return texts;
}

/**
 * The signature in one row's Signature cell, laid along the row and centred in it.
 * A name typed into the sheet's J3 wins: somebody then said in words who signs, and
 * printing the template's hand on top of that would claim two signatures for one
 * row. Otherwise every row is stamped, which is what the template's own sheet does.
 */
function signatureStamp(
  cells: Cell[],
  task: SealSheetTask,
  top: number,
): PdfStamp | null {
  if (task.signature) return null;

  const cell = cells.find((item) => item.key === "signature");
  if (!cell) return null;

  const width = Math.min(cell.textWidth, SIGNATURE_MAX_WIDTH);
  // Turned a quarter, the picture's height comes off its stored width.
  const height = (width * SIGNATURE.width) / SIGNATURE.height;

  return {
    x: cell.x + (cell.width - width) / 2,
    y: top - ROW_HEIGHT / 2 - height / 2,
    width,
    height,
    turn: "left",
  };
}

/**
 * Splits the rows over pages. A row with a long remark is taller than the rest,
 * so the pages are filled by height rather than by a row count.
 */
function paginate(cells: Cell[], lines: SealSheetLine[]) {
  const pages: { line: SealSheetLine; height: number }[][] = [];
  let current: { line: SealSheetLine; height: number }[] = [];
  let used = 0;

  for (const line of lines) {
    const height = rowHeight(cells, line);
    if (current.length > 0 && used + height > AVAILABLE_HEIGHT) {
      pages.push(current);
      current = [];
      used = 0;
    }
    current.push({ line, height });
    used += height;
  }

  if (current.length > 0 || pages.length === 0) pages.push(current);
  return pages;
}

function taskPages(
  task: SealSheetTask,
  chunks: { line: SealSheetLine; height: number }[][],
  cells: Cell[],
  pageOffset: number,
  pageCount: number,
) {
  return chunks.map((chunk, chunkIndex): PdfPage => {
    const header = tableHeader(cells);
    const texts: PdfText[] = [
      ...pageTitle(task, pageOffset + chunkIndex + 1, pageCount),
      ...header.texts,
    ];
    const lines: PdfLine[] = [...header.lines];
    const stamps: PdfStamp[] = [];

    const gridTop = TABLE_TOP;
    let y = header.bottom;

    // The header rule and one under every row, so the grid reads like the sheet.
    lines.push({ x1: MARGIN_X, y1: gridTop, x2: MARGIN_X + TABLE_WIDTH, y2: gridTop });
    lines.push({ x1: MARGIN_X, y1: y, x2: MARGIN_X + TABLE_WIDTH, y2: y });

    for (const row of chunk) {
      texts.push(...rowTexts(cells, row.line, task, y));
      const stamp = signatureStamp(cells, task, y);
      if (stamp) stamps.push(stamp);
      y -= row.height;
      lines.push({ x1: MARGIN_X, y1: y, x2: MARGIN_X + TABLE_WIDTH, y2: y });
    }

    for (const cell of cells) {
      lines.push({ x1: cell.x, y1: gridTop, x2: cell.x, y2: y });
    }
    lines.push({
      x1: MARGIN_X + TABLE_WIDTH,
      y1: gridTop,
      x2: MARGIN_X + TABLE_WIDTH,
      y2: y,
    });

    return { texts, lines, stamps };
  });
}

export function sealSheetPageCount(task: SealSheetTask) {
  return paginate(columnGeometry(), task.lines).length;
}

/** Every task starts on a fresh page, so a selection prints as separate sheets. */
export function buildSealSheetPdf(tasks: SealSheetTask[]) {
  const cells = columnGeometry();
  const chunked = tasks.map((task) => ({
    task,
    chunks: paginate(cells, task.lines),
  }));
  const pageCount = chunked.reduce((sum, entry) => sum + entry.chunks.length, 0);

  const pages: PdfPage[] = [];
  let offset = 0;

  for (const entry of chunked) {
    pages.push(...taskPages(entry.task, entry.chunks, cells, offset, pageCount));
    offset += entry.chunks.length;
  }

  return buildPdf(pages, tasks.map((task) => task.taskCode).join(", "), SIGNATURE);
}
