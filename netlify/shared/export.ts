import { type ImageStore } from "./images.js";
import {
  buildXlsx,
  type ImageSheet,
  type SheetColumn,
} from "./xlsx.js";

export const MAX_SELECTION = 500;

/** Header fills copied from the spreadsheet template the warehouse works from. */
export const GREEN_HEADER = "92D050";
export const BLUE_HEADER = "00B0F0";

export type ExportColumn = SheetColumn;

/** One spreadsheet line plus the name of the tab its photos go on. */
export type ExportRow = {
  id: number;
  sheetName: string;
  cells: string[];
};

export type ExportImage = {
  ownerId: number;
  slot: number;
  blobKey: string;
  contentType: string;
};

export function asciiFileName(value: string) {
  return value.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
}

export function describeProblem(record: {
  problemDescription: string;
  problemOther: string | null;
}) {
  return record.problemDescription === "Other" && record.problemOther
    ? `Other - ${record.problemOther}`
    : record.problemDescription;
}

/** The sheet shows dates the way the template does: 2026.02.06. */
export function formatSheetDate(recordDate: string | Date) {
  const value =
    recordDate instanceof Date ? recordDate.toISOString().slice(0, 10) : recordDate;
  return value.slice(0, 10).split("-").join(".");
}

/**
 * Downloads are named after the work date of the selection, e.g.
 * DHG_2026-02-06.xlsx. A selection spanning days falls back to the first one.
 */
export function exportFileName(prefix: string, recordDates: (string | Date)[]) {
  const days = recordDates
    .map((value) => (value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10)))
    .sort();

  return `${prefix}_${days[0] ?? "export"}.xlsx`;
}

/** Ids arrive from the client, so they are filtered down to plausible keys. */
export function readSelection(rawIds: unknown) {
  if (!Array.isArray(rawIds) || rawIds.length === 0) {
    return { error: "Select at least one record to download.", status: 400 } as const;
  }
  if (rawIds.length > MAX_SELECTION) {
    return { error: `Select at most ${MAX_SELECTION} records.`, status: 400 } as const;
  }

  const ids = Array.from(
    new Set(
      rawIds.filter(
        (id): id is number => Number.isSafeInteger(id) && (id as number) > 0,
      ),
    ),
  );

  if (ids.length === 0) {
    return { error: "Invalid record selection.", status: 400 } as const;
  }

  return { ids } as const;
}

/**
 * The selection becomes a single workbook: the grid on the first tab, then one
 * tab per line that has photos, named the way that export names its tabs. Lines
 * without photos get no tab.
 */
export async function buildWorkbookDownload(options: {
  store: ImageStore;
  fileName: string;
  sheetName: string;
  columns: ExportColumn[];
  rows: ExportRow[];
  images: ExportImage[];
}) {
  const imageSheets: ImageSheet[] = [];

  for (const row of options.rows) {
    const rowImages = options.images
      .filter((image) => image.ownerId === row.id)
      .sort((left, right) => left.slot - right.slot);
    if (rowImages.length === 0) continue;

    const loaded = [];
    for (const image of rowImages) {
      const data = await options.store.get(image.blobKey, { type: "arrayBuffer" });
      if (!data) continue;
      loaded.push({ data: new Uint8Array(data), contentType: image.contentType });
    }

    if (loaded.length > 0) imageSheets.push({ name: row.sheetName, images: loaded });
  }

  return {
    fileName: options.fileName,
    data: buildXlsx(
      {
        name: options.sheetName,
        columns: options.columns,
        rows: options.rows.map((row) => row.cells),
      },
      imageSheets,
    ),
  };
}

export function spreadsheetResponse(download: { fileName: string; data: Uint8Array }) {
  return fileResponse(
    download,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
}

/** The finished yellow seal sheet is printed and signed, so it goes out as PDF. */
export function pdfResponse(download: { fileName: string; data: Uint8Array }) {
  return fileResponse(download, "application/pdf");
}

function fileResponse(
  download: { fileName: string; data: Uint8Array },
  contentType: string,
) {
  return new Response(download.data, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(download.data.length),
      "Content-Disposition": `attachment; filename="${asciiFileName(
        download.fileName,
      )}"; filename*=UTF-8''${encodeURIComponent(download.fileName)}`,
    },
  });
}
