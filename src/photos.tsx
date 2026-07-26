import { ChangeEvent, useCallback, useState } from "react";

export type RecordImage = {
  id: number;
  slot: number;
  fileName: string;
  contentType: string;
  byteSize: number;
};

export type PhotoSlot =
  | { kind: "empty" }
  | { kind: "existing"; imageId: number; fileName: string }
  | { kind: "new"; file: File };

export const PHOTO_SLOTS = [0, 1];

const EMPTY_SLOTS: PhotoSlot[] = [{ kind: "empty" }, { kind: "empty" }];
const MAX_IMAGE_EDGE = 1600;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const RECOMPRESS_ABOVE_BYTES = 400 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * Photos come straight off a phone camera, so they are scaled down before
 * upload — the archive stays small enough to download over the warehouse wifi.
 */
async function prepareImage(file: File) {
  if (file.size <= RECOMPRESS_ABOVE_BYTES && ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);

    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.78),
    );
    if (!blob) throw new Error("Encoding failed.");

    const baseName = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

/** Slot state and downscaling for a two-photo form. */
export function usePhotoSlots(onError: (message: string) => void) {
  const [photoSlots, setPhotoSlots] = useState<PhotoSlot[]>(EMPTY_SLOTS);

  const resetPhotos = useCallback(() => setPhotoSlots(EMPTY_SLOTS), []);

  const loadPhotos = useCallback((images: RecordImage[]) => {
    setPhotoSlots(
      PHOTO_SLOTS.map((index) => {
        const image = images.find((item) => item.slot === index + 1);
        return image
          ? ({ kind: "existing", imageId: image.id, fileName: image.fileName } as PhotoSlot)
          : ({ kind: "empty" } as PhotoSlot);
      }),
    );
  }, []);

  const pickPhoto = useCallback(
    async (index: number, event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;

      const prepared = await prepareImage(file);

      if (!ALLOWED_IMAGE_TYPES.includes(prepared.type)) {
        onError("Csak JPEG, PNG vagy WEBP kép tölthető fel.");
        return;
      }
      if (prepared.size > MAX_IMAGE_BYTES) {
        onError("A kép túl nagy, legfeljebb 6 MB tölthető fel.");
        return;
      }

      setPhotoSlots((current) =>
        current.map((slot, slotIndex) =>
          slotIndex === index ? { kind: "new", file: prepared } : slot,
        ),
      );
    },
    [onError],
  );

  const clearPhoto = useCallback((index: number) => {
    setPhotoSlots((current) =>
      current.map((slot, slotIndex) =>
        slotIndex === index ? { kind: "empty" } : slot,
      ),
    );
  }, []);

  return { photoSlots, resetPhotos, loadPhotos, pickPhoto, clearPhoto };
}

/** Mirrors the slot intents the API expects: keep, empty or replace. */
export function appendPhotoSlots(payload: FormData, slots: PhotoSlot[]) {
  slots.forEach((slot, index) => {
    const field = `image${index + 1}`;
    if (slot.kind === "new") {
      payload.set(`${field}Action`, "replace");
      payload.set(field, slot.file, slot.file.name);
      return;
    }
    payload.set(`${field}Action`, slot.kind === "existing" ? "keep" : "empty");
  });
}

/**
 * Two plain upload fields instead of preview tiles — photos are the exception
 * on this form, so the warning above them is what should catch the eye.
 */
export function PhotoFields({
  slots,
  onPick,
  onClear,
}: {
  slots: PhotoSlot[];
  onPick: (index: number, event: ChangeEvent<HTMLInputElement>) => void;
  onClear: (index: number) => void;
}) {
  return (
    <div className="field field-wide photo-fields">
      <p className="photo-warning">Upload only for request!</p>
      {slots.map((slot, index) => {
        const fileName =
          slot.kind === "new"
            ? slot.file.name
            : slot.kind === "existing"
              ? slot.fileName
              : "";

        return (
          <div className="photo-field" key={index}>
            <label className="photo-input">
              <span className={fileName ? "photo-name" : "photo-placeholder"}>
                {fileName || "upload photo"}
              </span>
              <input
                type="file"
                accept="image/*"
                onChange={(event) => onPick(index, event)}
              />
            </label>
            {fileName && (
              <button
                className="photo-clear"
                type="button"
                onClick={() => onClear(index)}
                title={`Remove photo ${index + 1}`}
                aria-label={`Remove photo ${index + 1}`}
              >
                ✕
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
