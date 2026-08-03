/**
 * Naming rules for the Andi gallery. A picture here is only ever worth what it
 * is called when it lands in someone's Downloads folder, so the name the
 * operator types is the one thing the server has to get right: it is theirs to
 * choose, but it still has to survive Windows, a ZIP listing and a re-download.
 */

/** Pictures are downscaled in the browser before they are sent. */
export const ANDI_MAX_IMAGE_BYTES = 800 * 1024;

/** A ZIP is built in one request, so the day's lot is handed out in batches. */
export const ANDI_MAX_ZIP_ENTRIES = 200;

/**
 * How far back the download log is listed. It is a receipt, not an archive: the
 * entries that matter are the last handful, and the whole lot goes when the
 * buffer is emptied anyway.
 */
export const ANDI_MAX_DOWNLOAD_HISTORY = 60;

export const MAX_PHOTO_NAME_LENGTH = 80;

/** A ZIP name plus a count of photos still fits comfortably. */
const MAX_DOWNLOAD_LABEL_LENGTH = 140;

export const ANDI_DOWNLOAD_FORMATS = ["jpeg", "zip"] as const;

export type AndiDownloadFormat = (typeof ANDI_DOWNLOAD_FORMATS)[number];


const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export type AndiPhotoRow = {
  id: number;
  recordDate: string | Date;
  fileName: string;
  contentType: string;
  byteSize: number;
  createdAt: Date | string;
};

export type AndiDownloadRow = {
  id: number;
  recordDate: string | Date;
  format: string;
  fileName: string;
  photoIds: string;
  photoCount: number;
  byteSize: number;
  createdAt: Date | string;
};

export function extensionFor(contentType: string) {
  return EXTENSIONS[contentType] ?? "jpg";
}

/**
 * Control characters travel in pasted text and mean nothing in a file name, so
 * they are dropped before anything else looks at it.
 */
function printableOnly(value: string) {
  return Array.from(value)
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code > 31 && code !== 127;
    })
    .join("");
}

/**
 * A file name the browser and Explorer will both take: the characters Windows
 * refuses are dropped, the extension always matches what is actually stored, and
 * a name typed as nothing at all falls back to the day and the upload.
 */
export function photoFileName(
  value: unknown,
  contentType: string,
  fallback: string,
) {
  const extension = extensionFor(contentType);
  const base = printableOnly(typeof value === "string" ? value : "")
    // The name is shown and edited without its extension, but a paste of the
    // whole file name should not end up as "photo.jpg.jpg".
    .replace(new RegExp(`\\.${extension}$`, "i"), "")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .slice(0, MAX_PHOTO_NAME_LENGTH)
    .trim();

  return `${base || fallback}.${extension}`;
}

/** Metadata is safe to hand to the client; the bytes go out one request at a time. */
export function publicPhoto(photo: AndiPhotoRow) {
  return {
    id: photo.id,
    recordDate: dateOnly(photo.recordDate),
    fileName: photo.fileName,
    contentType: photo.contentType,
    byteSize: photo.byteSize,
    createdAt: new Date(photo.createdAt).toISOString(),
  };
}

function dateOnly(value: string | Date) {
  return value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value).slice(0, 10);
}

export function isAndiDownloadFormat(value: unknown): value is AndiDownloadFormat {
  return ANDI_DOWNLOAD_FORMATS.includes(value as AndiDownloadFormat);
}

/**
 * The name of what was handed over, as the history lists it. It is written by
 * whoever asked for the download, so it is stripped of anything that has no
 * business being rendered back and cut to a length that fits one line.
 */
export function downloadLabel(value: unknown, fallback: string) {
  const label = printableOnly(typeof value === "string" ? value : "")
    .replace(/\s+/g, " ")
    .slice(0, MAX_DOWNLOAD_LABEL_LENGTH)
    .trim();

  return label || fallback;
}

export function serializePhotoIds(ids: number[]) {
  return JSON.stringify(ids);
}

/** A log entry written by an older version must never break the listing. */
export function parsePhotoIds(value: string): number[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (id): id is number => Number.isSafeInteger(id) && (id as number) > 0,
    );
  } catch {
    return [];
  }
}

/**
 * One history entry. `availableIds` is what is still in the buffer of what went
 * out: a picture deleted since is not coming back, so the tab can offer the same
 * download again, offer what is left of it, or say it is gone.
 */
export function publicDownload(entry: AndiDownloadRow, presentIds: Set<number>) {
  const photoIds = parsePhotoIds(entry.photoIds);

  return {
    id: entry.id,
    recordDate: dateOnly(entry.recordDate),
    format: entry.format,
    fileName: entry.fileName,
    photoIds,
    availableIds: photoIds.filter((id) => presentIds.has(id)),
    photoCount: entry.photoCount,
    byteSize: entry.byteSize,
    createdAt: new Date(entry.createdAt).toISOString(),
  };
}

/**
 * Nothing stops two pictures from being renamed the same thing, but a ZIP with
 * two identical entries loses one of them on extraction — so the second copy
 * becomes `name (2).jpg` on the way in.
 */
export function uniqueEntryNames(names: string[]) {
  const taken = new Set<string>();

  return names.map((name) => {
    const match = /^(.*?)(\.[^.]*)?$/.exec(name);
    const base = match?.[1] || name;
    const extension = match?.[2] ?? "";

    let candidate = name;
    let copy = 2;
    while (taken.has(candidate.toLowerCase())) {
      candidate = `${base} (${copy})${extension}`;
      copy += 1;
    }

    taken.add(candidate.toLowerCase());
    return candidate;
  });
}
