import { getStore } from "@netlify/blobs";

export const IMAGE_STORE = "deletion-request-images";

export const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function getImageStore() {
  return getStore(IMAGE_STORE);
}

export function imageExtension(contentType: string) {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}
