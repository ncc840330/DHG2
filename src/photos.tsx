import {
  ChangeEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

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
  | { kind: "new"; file: File; previewUrl: string };

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

/** Slot state, preview bookkeeping and downscaling for a two-photo form. */
export function usePhotoSlots(onError: (message: string) => void) {
  const [photoSlots, setPhotoSlots] = useState<PhotoSlot[]>(EMPTY_SLOTS);
  const previewUrls = useRef<string[]>([]);

  useEffect(
    () => () => {
      previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
      previewUrls.current = [];
    },
    [],
  );

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

      const previewUrl = URL.createObjectURL(prepared);
      previewUrls.current.push(previewUrl);
      setPhotoSlots((current) =>
        current.map((slot, slotIndex) =>
          slotIndex === index ? { kind: "new", file: prepared, previewUrl } : slot,
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

export function PhotoFields({
  slots,
  imagePath,
  onPick,
  onClear,
}: {
  slots: PhotoSlot[];
  imagePath: string;
  onPick: (index: number, event: ChangeEvent<HTMLInputElement>) => void;
  onClear: (index: number) => void;
}) {
  return (
    <div className="field field-wide">
      <span>
        PHOTOS <small>MAX 2 PER LINE ID</small>
      </span>
      <div className="photo-grid">
        {slots.map((slot, index) => {
          const preview =
            slot.kind === "new"
              ? slot.previewUrl
              : slot.kind === "existing"
                ? `${imagePath}?id=${slot.imageId}`
                : null;

          return (
            <div className="photo-slot" key={index}>
              {preview ? (
                <img src={preview} alt={`Photo ${index + 1}`} />
              ) : (
                <div className="photo-empty">
                  <svg aria-hidden="true" viewBox="0 0 24 24">
                    <path d="M4 7h4l2-2h4l2 2h4v12H4zM12 16a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" />
                  </svg>
                  <b>PHOTO {index + 1}</b>
                </div>
              )}
              <div className="photo-actions">
                <label className="photo-pick">
                  {slot.kind === "empty" ? "ADD" : "REPLACE"}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) => onPick(index, event)}
                  />
                </label>
                {slot.kind !== "empty" && (
                  <button type="button" onClick={() => onClear(index)}>
                    REMOVE
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
