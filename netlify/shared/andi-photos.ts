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

export const MAX_PHOTO_NAME_LENGTH = 80;

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
  const recordDate =
    photo.recordDate instanceof Date
      ? photo.recordDate.toISOString().slice(0, 10)
      : String(photo.recordDate).slice(0, 10);

  return {
    id: photo.id,
    recordDate,
    fileName: photo.fileName,
    contentType: photo.contentType,
    byteSize: photo.byteSize,
    createdAt: new Date(photo.createdAt).toISOString(),
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
