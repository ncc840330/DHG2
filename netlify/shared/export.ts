/**
 * Shared "download the selection" pipeline.
 *
 * Records are grouped by source task ID and every group becomes a
 * `<source task id>.zip` holding one `<source task id>.xlsx` plus the photos of
 * its records, renamed after the system SN. Selecting several source task IDs
 * bundles those ZIPs into a single archive so one click stays one download.
 */
import * as XLSX from "xlsx";
import { getImageStore, imageExtension } from "./images.js";
import { createZip, type ZipEntry } from "./zip.js";

export const MAX_SELECTION = 500;

const SHEET_COLUMNS = [
  "Line ID",
  "Source Task ID",
  "System Item",
  "System SN",
  "Problem Description",
];

export type ExportRecord = {
  id: number;
  lineId: string;
  sourceTaskId: string;
  systemItem: string;
  systemSn: string;
  problemDescription: string;
  problemOther: string | null;
};

export type ExportImage = {
  recordId: number;
  slot: number;
  blobKey: string;
  contentType: string;
};

function safeFileName(value: string, fallback: string) {
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.\s-]+|[.\s-]+$/g, "")
    .slice(0, 80);

  return cleaned || fallback;
}

function asciiFileName(value: string) {
  return value.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
}

function describeProblem(record: ExportRecord) {
  return record.problemDescription === "Other" && record.problemOther
    ? `Other - ${record.problemOther}`
    : record.problemDescription;
}

function buildWorkbook(records: ExportRecord[], sheetName: string) {
  const rows = [
    SHEET_COLUMNS,
    ...records.map((record) => [
      record.lineId,
      record.sourceTaskId,
      record.systemItem,
      record.systemSn,
      describeProblem(record),
    ]),
  ];

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = [
    { wch: 16 },
    { wch: 20 },
    { wch: 26 },
    { wch: 22 },
    { wch: 34 },
  ];

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, sheetName);

  return new Uint8Array(
    XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer,
  );
}

/**
 * Photos are named after the system SN. Two records in the same source task can
 * legitimately share one, so fall back to the Line ID to keep names unique.
 */
function imageName(
  record: ExportRecord,
  position: number,
  contentType: string,
  taken: Set<string>,
) {
  const extension = imageExtension(contentType);
  const suffix = String(position).padStart(2, "0");
  const base = safeFileName(record.systemSn, record.lineId);

  let name = `${base}_${suffix}.${extension}`;
  if (taken.has(name)) {
    name = `${base}_${safeFileName(record.lineId, "line")}_${suffix}.${extension}`;
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
  sourceTaskId: string,
  records: ExportRecord[],
  images: ExportImage[],
  sheetName: string,
) {
  const fileName = safeFileName(sourceTaskId, "source-task");
  const entries: ZipEntry[] = [
    { name: `${fileName}.xlsx`, data: buildWorkbook(records, sheetName) },
  ];
  const taken = new Set<string>();

  if (images.length > 0) {
    const store = getImageStore();

    for (const record of records) {
      const recordImages = images
        .filter((image) => image.recordId === record.id)
        .sort((left, right) => left.slot - right.slot);

      for (const [index, image] of recordImages.entries()) {
        const data = await store.get(image.blobKey, { type: "arrayBuffer" });
        if (!data) continue;

        entries.push({
          name: imageName(record, index + 1, image.contentType, taken),
          data: new Uint8Array(data),
        });
      }
    }
  }

  return { fileName: `${fileName}.zip`, data: createZip(entries) };
}

export function parseSelection(
  body: unknown,
): { ids: number[]; error: null } | { ids: null; error: string } {
  const rawIds = (body as { ids?: unknown } | null)?.ids;

  if (!Array.isArray(rawIds) || rawIds.length === 0) {
    return { ids: null, error: "Select at least one record to download." };
  }
  if (rawIds.length > MAX_SELECTION) {
    return { ids: null, error: `Select at most ${MAX_SELECTION} records.` };
  }

  const ids = Array.from(
    new Set(
      rawIds.filter(
        (id): id is number => Number.isSafeInteger(id) && (id as number) > 0,
      ),
    ),
  );

  if (ids.length === 0) {
    return { ids: null, error: "Invalid record selection." };
  }

  return { ids, error: null };
}

export async function buildArchiveResponse(options: {
  records: ExportRecord[];
  images: ExportImage[];
  sheetName: string;
  bundlePrefix: string;
}) {
  const byTask = new Map<string, ExportRecord[]>();
  for (const record of options.records) {
    const group = byTask.get(record.sourceTaskId) ?? [];
    group.push(record);
    byTask.set(record.sourceTaskId, group);
  }

  const archives = [];
  for (const [sourceTaskId, group] of byTask) {
    archives.push(
      await buildTaskArchive(sourceTaskId, group, options.images, options.sheetName),
    );
  }

  const [single] = archives;
  const download =
    archives.length === 1
      ? single
      : {
          fileName: `${options.bundlePrefix}-${new Date()
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
