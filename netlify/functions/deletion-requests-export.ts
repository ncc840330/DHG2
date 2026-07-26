import { asc, inArray } from "drizzle-orm";
import * as XLSX from "xlsx";
import { db } from "../../db/index.js";
import { deletionRequestImages, deletionRequests } from "../../db/schema.js";
import { getImageStore, imageExtension } from "../shared/images.js";
import { apiError } from "../shared/records.js";
import { createZip, type ZipEntry } from "../shared/zip.js";

const MAX_SELECTION = 500;
const SHEET_COLUMNS = [
  "Line ID",
  "Source Task ID",
  "System Item",
  "System SN",
  "Problem Description",
];

type ExportRecord = typeof deletionRequests.$inferSelect;
type ExportImage = typeof deletionRequestImages.$inferSelect;

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

function buildWorkbook(records: ExportRecord[]) {
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
  XLSX.utils.book_append_sheet(book, sheet, "Deletion Requests");

  return new Uint8Array(
    XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer,
  );
}

/**
 * Images are named after the system SN. Two records in the same source task can
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
) {
  const store = getImageStore();
  const fileName = safeFileName(sourceTaskId, "source-task");
  const entries: ZipEntry[] = [
    { name: `${fileName}.xlsx`, data: buildWorkbook(records) },
  ];
  const taken = new Set<string>();

  for (const record of records) {
    const recordImages = images
      .filter((image) => image.requestId === record.id)
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

  return { fileName: `${fileName}.zip`, data: createZip(entries) };
}

export default async (request: Request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { Allow: "POST" },
    });
  }

  const body = await request.json().catch(() => null);
  const rawIds = (body as { ids?: unknown })?.ids;

  if (!Array.isArray(rawIds) || rawIds.length === 0) {
    return apiError("Select at least one record to download.", 400);
  }
  if (rawIds.length > MAX_SELECTION) {
    return apiError(`Select at most ${MAX_SELECTION} records.`, 400);
  }

  const ids = Array.from(
    new Set(
      rawIds.filter(
        (id): id is number => Number.isSafeInteger(id) && (id as number) > 0,
      ),
    ),
  );
  if (ids.length === 0) return apiError("Invalid record selection.", 400);

  const records = await db
    .select()
    .from(deletionRequests)
    .where(inArray(deletionRequests.id, ids))
    .orderBy(asc(deletionRequests.sourceTaskId), asc(deletionRequests.lineId));

  if (records.length === 0) return apiError("No matching records found.", 404);

  const images = await db
    .select()
    .from(deletionRequestImages)
    .where(
      inArray(
        deletionRequestImages.requestId,
        records.map((record) => record.id),
      ),
    )
    .orderBy(asc(deletionRequestImages.slot));

  const byTask = new Map<string, ExportRecord[]>();
  for (const record of records) {
    const group = byTask.get(record.sourceTaskId) ?? [];
    group.push(record);
    byTask.set(record.sourceTaskId, group);
  }

  const archives = [];
  for (const [sourceTaskId, group] of byTask) {
    archives.push(await buildTaskArchive(sourceTaskId, group, images));
  }

  // One source task ID means the caller wants that ZIP straight away; several
  // get bundled so a single click still yields a single download.
  const [single] = archives;
  const download =
    archives.length === 1
      ? single
      : {
          fileName: `deletion-requests-${new Date()
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
};

export const config = {
  path: "/api/deletion-requests/export",
};
