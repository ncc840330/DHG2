/**
 * The Andi gallery, browser side: pictures are shot on the phone or picked out of
 * the gallery, and both arrive far too big to keep. Every one of them is
 * re-encoded to a JPEG under the size limit before it is ever uploaded — the
 * warehouse wifi is what it is, and a day's worth of untouched phone photos is
 * not something anyone wants to download again at the other end.
 */

/** Kept in step with `netlify/shared/andi-photos.ts`, which refuses anything over. */
export const ANDI_MAX_BYTES = 800 * 1024;

/** Aimed at rather than the ceiling, so a picture has room to be renamed. */
export const ANDI_TARGET_BYTES = 700 * 1024;

export const ANDI_MAX_ZIP_ENTRIES = 200;

export const MAX_NAME_LENGTH = 80;

const MAX_EDGE = 2400;
const MIN_EDGE = 720;
const START_QUALITY = 0.82;
const MIN_QUALITY = 0.4;
const MAX_ATTEMPTS = 7;

/** A picture as the gallery lists it. The bytes stay on the server. */
export type AndiPhoto = {
  id: number;
  recordDate: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  createdAt: string;
};

/**
 * One line of the download history. `availableIds` is what is left in the buffer
 * of the pictures that went out, so a repeat can be offered, offered short, or
 * refused outright.
 */
export type AndiDownload = {
  id: number;
  recordDate: string;
  format: string;
  fileName: string;
  photoIds: number[];
  availableIds: number[];
  photoCount: number;
  byteSize: number;
  createdAt: string;
};

/** What the whole buffer holds, every work day counted together. */
export type AndiBuffer = {
  photoCount: number;
  byteSize: number;
  oldestDate: string | null;
  newestDate: string | null;
  downloadCount: number;
};

/** A compressed pick, waiting for its name and the upload. */
export type StagedPhoto = {
  key: string;
  name: string;
  file: File;
  /** What came off the camera, so the shrinking is visible. */
  originalSize: number;
  previewUrl: string;
};

export function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * When a download happened, as the history lists it: the clock time on its own
 * for today's, the day in front of it for anything older — the operator is
 * looking for "the one I made after lunch", not for a timestamp.
 */
export function formatDownloadStamp(isoTime: string, now = new Date()) {
  const stamp = new Date(isoTime);
  if (Number.isNaN(stamp.getTime())) return "";

  const time = stamp.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const isToday = stamp.toDateString() === now.toDateString();
  if (isToday) return time;

  const day = String(stamp.getDate()).padStart(2, "0");
  const month = String(stamp.getMonth() + 1).padStart(2, "0");
  return `${month}.${day} ${time}`;
}

/** The editable part of a file name: everything before the extension. */
export function baseName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "");
}

/**
 * Only what a file name may not contain is taken out while they type — a name is
 * tidied up when it is sent, not under the operator's fingers.
 */
export function cleanNameInput(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-").slice(0, MAX_NAME_LENGTH);
}

export function finalName(value: string, fallback: string) {
  const base = cleanNameInput(value)
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .trim();

  return base || fallback;
}

/**
 * `raktar-01 … raktar-12`: enough digits for the whole batch, so the numbers
 * still sort in order once the pictures are sitting in a folder.
 */
export function numberedName(prefix: string, index: number, total: number) {
  const digits = Math.max(2, String(total).length);
  return `${finalName(prefix, "andi")}-${String(index + 1).padStart(digits, "0")}`;
}

/**
 * Names given twice, lowercased. Nothing stops it — the ZIP renames the second
 * copy — but the operator should see it before they download.
 */
export function duplicateNames(names: string[]) {
  const seen = new Set<string>();
  const twice = new Set<string>();

  for (const name of names) {
    const key = finalName(name, "").toLowerCase();
    if (!key) continue;
    if (seen.has(key)) twice.add(key);
    seen.add(key);
  }

  return twice;
}

async function encodeJpeg(
  bitmap: ImageBitmap,
  edge: number,
  quality: number,
): Promise<Blob | null> {
  const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));

  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  return new Promise((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality),
  );
}

/**
 * Squeezes one picked file under the limit. Quality goes first because it costs
 * the least to look at; only once that is spent does the picture get smaller, and
 * by how far the last attempt overshot rather than a blind step — a 12 MP photo
 * is usually done in two encodes.
 */
export async function compressPhoto(
  file: File,
): Promise<{ file: File; error?: undefined } | { file?: undefined; error: string }> {
  if (!file.type.startsWith("image/")) {
    return { error: `${file.name}: only image files can be uploaded.` };
  }

  // A picture that is already a small enough JPEG is left exactly as it is.
  if (file.type === "image/jpeg" && file.size <= ANDI_TARGET_BYTES) {
    return { file };
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { error: `${file.name}: the image could not be read.` };
  }

  try {
    let edge = Math.min(MAX_EDGE, Math.max(bitmap.width, bitmap.height));
    let quality = START_QUALITY;
    let best: Blob | null = null;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const blob = await encodeJpeg(bitmap, edge, quality);
      if (!blob) break;

      best = blob;
      if (blob.size <= ANDI_TARGET_BYTES) break;

      if (quality > 0.62) {
        quality = 0.62;
        continue;
      }

      const nextEdge = Math.max(
        MIN_EDGE,
        Math.round(edge * Math.min(0.9, Math.sqrt(ANDI_TARGET_BYTES / blob.size))),
      );

      if (nextEdge >= edge) {
        if (quality <= MIN_QUALITY) break;
        quality = Math.max(MIN_QUALITY, quality - 0.12);
      } else {
        edge = nextEdge;
      }
    }

    if (!best) return { error: `${file.name}: compression failed.` };
    if (best.size > ANDI_MAX_BYTES) {
      return {
        error: `${file.name}: could not be compressed under ${Math.round(
          ANDI_MAX_BYTES / 1024,
        )} KB.`,
      };
    }

    return {
      file: new File([best], `${baseName(file.name) || "andi"}.jpg`, {
        type: "image/jpeg",
      }),
    };
  } finally {
    bitmap.close();
  }
}
