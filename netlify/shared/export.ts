import * as XLSX from "xlsx";
import { imageExtension, type ImageStore } from "./images.js";
import { createZip, type ZipEntry } from "./zip.js";

export const MAX_SELECTION = 500;

export type ExportColumn = { label: string; width: number };

/** One spreadsheet line plus the bits used to name its files. */
export type ExportRow = {
  id: number;
  lineId: string;
  systemSn: string;
  sourceTaskId: string;
  cells: string[];
};

export type ExportImage = {
  ownerId: number;
  slot: number;
  blobKey: string;
  contentType: string;
};

export function safeFileName(value: string, fallback: string) {
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.\s-]+|[.\s-]+$/g, "")
    .slice(0, 80);

  return cleaned || fallback;
}

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

function buildWorkbook(
  sheetName: string,
  columns: ExportColumn[],
  rows: ExportRow[],
) {
  const sheet = XLSX.utils.aoa_to_sheet([
    columns.map((column) => column.label),
    ...rows.map((row) => row.cells),
  ]);
  sheet["!cols"] = columns.map((column) => ({ wch: column.width }));

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, sheetName);

  return new Uint8Array(
    XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer,
  );
}

/**
 * Images are named after the system SN. Two rows in the same source task can
 * legitimately share one, so fall back to the Line ID to keep names unique.
 */
function imageName(
  row: ExportRow,
  position: number,
  contentType: string,
  taken: Set<string>,
) {
  const extension = imageExtension(contentType);
  const suffix = String(position).padStart(2, "0");
  const base = safeFileName(row.systemSn, row.lineId);

  let name = `${base}_${suffix}.${extension}`;
  if (taken.has(name)) {
    name = `${base}_${safeFileName(row.lineId, "line")}_${suffix}.${extension}`;
  }

  let attempt = 2;
  while (taken.has(name)) {
    name = `${base}_${suffix}-${attempt}.${extension}`;
    attempt += 1;
  }

  taken.add(name);
  return name;
}

async function buildTaskArchive(
  options: {
    store: ImageStore;
    sheetName: string;
    columns: ExportColumn[];
    images: ExportImage[];
  },
  sourceTaskId: string,
  rows: ExportRow[],
) {
  const fileName = safeFileName(sourceTaskId, "source-task");
  const entries: ZipEntry[] = [
    {
      name: `${fileName}.xlsx`,
      data: buildWorkbook(options.sheetName, options.columns, rows),
    },
  ];
  const taken = new Set<string>();

  for (const row of rows) {
    const rowImages = options.images
      .filter((image) => image.ownerId === row.id)
      .sort((left, right) => left.slot - right.slot);

    for (const [index, image] of rowImages.entries()) {
      const data = await options.store.get(image.blobKey, {
        type: "arrayBuffer",
      });
      if (!data) continue;

      entries.push({
        name: imageName(row, index + 1, image.contentType, taken),
        data: new Uint8Array(data),
      });
    }
  }

  return { fileName: `${fileName}.zip`, data: createZip(entries) };
}

/**
 * One source task ID means the caller wants that ZIP straight away; several get
 * bundled so a single click still yields a single download.
 */
export async function buildTaskDownload(options: {
  store: ImageStore;
  sheetName: string;
  columns: ExportColumn[];
  rows: ExportRow[];
  images: ExportImage[];
  bundleName: string;
}) {
  const byTask = new Map<string, ExportRow[]>();
  for (const row of options.rows) {
    const group = byTask.get(row.sourceTaskId) ?? [];
    group.push(row);
    byTask.set(row.sourceTaskId, group);
  }

  const archives = [];
  for (const [sourceTaskId, group] of byTask) {
    archives.push(await buildTaskArchive(options, sourceTaskId, group));
  }

  const [single] = archives;
  if (archives.length === 1) return single;

  return {
    fileName: `${options.bundleName}-${new Date()
      .toISOString()
      .slice(0, 10)
      .replaceAll("-", "")}.zip`,
    data: createZip(
      archives.map((archive) => ({
        name: archive.fileName,
        data: archive.data,
      })),
    ),
  };
}

export function zipResponse(download: { fileName: string; data: Uint8Array }) {
  return new Response(download.data, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(download.data.length),
      "Content-Disposition": `attachment; filename="${asciiFileName(
        download.fileName,
      )}"; filename*=UTF-8''${encodeURIComponent(download.fileName)}`,
    },
  });
}
