import { getStore } from "@netlify/blobs";

export const IMAGE_STORE = "deletion-request-images";

export const DHG_IMAGE_STORE = "dhg-record-images";

export const HW_CHECK_IMAGE_STORE = "hw-check-task-images";

export const ANDI_PHOTO_STORE = "andi-photos";

export const IMAGE_SLOTS = [1, 2] as const;

export const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export type ImageStore = ReturnType<typeof getStore>;

export type SlotIntent = {
  slot: number;
  action: "keep" | "empty" | "replace";
  file: File | null;
};

export type UploadedImage = {
  slot: number;
  blobKey: string;
  contentType: string;
  fileName: string;
  byteSize: number;
};

export function getImageStore() {
  return getStore(IMAGE_STORE);
}

export function getDhgImageStore() {
  return getStore(DHG_IMAGE_STORE);
}

export function getHwCheckImageStore() {
  return getStore(HW_CHECK_IMAGE_STORE);
}

export function getAndiPhotoStore() {
  return getStore(ANDI_PHOTO_STORE);
}

/**
 * Each slot carries its own intent so an update can express "leave the stored
 * image alone", "drop it" and "swap it out" without a separate endpoint.
 */
export function readSlotIntents(form: FormData): SlotIntent[] | null {
  const intents: SlotIntent[] = [];

  for (const slot of IMAGE_SLOTS) {
    const value = form.get(`image${slot}Action`);
    const action = (typeof value === "string" ? value.trim() : "") || "empty";
    const file = form.get(`image${slot}`);

    if (action === "keep" || action === "empty") {
      intents.push({ slot, action, file: null });
      continue;
    }

    if (action !== "replace") return null;
    if (!(file instanceof File) || file.size === 0) return null;
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return null;
    if (file.size > MAX_IMAGE_BYTES) return null;

    intents.push({ slot, action, file });
  }

  return intents;
}

export async function uploadImages(
  store: ImageStore,
  intents: SlotIntent[],
): Promise<UploadedImage[]> {
  return Promise.all(
    intents
      .filter((intent): intent is SlotIntent & { file: File } => !!intent.file)
      .map(async ({ slot, file }) => {
        const blobKey = `${crypto.randomUUID()}-${slot}`;
        const data = await file.arrayBuffer();
        await store.set(blobKey, data);

        return {
          slot,
          blobKey,
          contentType: file.type,
          fileName: file.name || `image-${slot}`,
          byteSize: data.byteLength,
        };
      }),
  );
}

export async function discardBlobs(store: ImageStore, blobKeys: string[]) {
  if (blobKeys.length === 0) return;
  await Promise.allSettled(blobKeys.map((blobKey) => store.delete(blobKey)));
}

/** Image metadata is safe to hand to the client; the bytes never are. */
export function publicImageMeta(image: UploadedImage & { id: number }) {
  return {
    id: image.id,
    slot: image.slot,
    fileName: image.fileName,
    contentType: image.contentType,
    byteSize: image.byteSize,
  };
}
