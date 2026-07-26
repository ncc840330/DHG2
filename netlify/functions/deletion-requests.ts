import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "../../db/index.js";
import { deletionRequestImages, deletionRequests } from "../../db/schema.js";
import {
  discardBlobs,
  loadImages,
  withImages,
} from "../shared/deletion-requests.js";
import {
  ALLOWED_IMAGE_TYPES,
  getImageStore,
  MAX_IMAGE_BYTES,
} from "../shared/images.js";
import { nextLineId } from "../shared/line-ids.js";
import {
  apiError,
  isProblemOption,
  isValidDateKey,
  parseId,
  type ProblemOption,
} from "../shared/records.js";

const IMAGE_SLOTS = [1, 2] as const;

type RequestInput = {
  sourceTaskId: string;
  systemItem: string;
  systemSn: string;
  problemDescription: ProblemOption;
  problemOther: string | null;
};

type SlotIntent = {
  slot: number;
  action: "keep" | "empty" | "replace";
  file: File | null;
};

type UploadedImage = {
  slot: number;
  blobKey: string;
  contentType: string;
  fileName: string;
  byteSize: number;
};

function formString(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function validateRequestInput(form: FormData): RequestInput | null {
  const sourceTaskId = formString(form, "sourceTaskId");
  const systemItem = formString(form, "systemItem");
  const systemSn = formString(form, "systemSn");
  const problemDescription = formString(form, "problemDescription");
  const problemOther = formString(form, "problemOther");

  if (!sourceTaskId || !systemItem || !systemSn) return null;
  if (!isProblemOption(problemDescription)) return null;
  if (problemDescription === "Other" && !problemOther) return null;

  return {
    sourceTaskId,
    systemItem,
    systemSn,
    problemDescription,
    problemOther: problemDescription === "Other" ? problemOther : null,
  };
}

/**
 * Each slot carries its own intent so an update can express "leave the stored
 * image alone", "drop it" and "swap it out" without a separate endpoint.
 */
function readSlotIntents(form: FormData): SlotIntent[] | null {
  const intents: SlotIntent[] = [];

  for (const slot of IMAGE_SLOTS) {
    const action = formString(form, `image${slot}Action`) || "empty";
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

async function uploadImages(intents: SlotIntent[]): Promise<UploadedImage[]> {
  const store = getImageStore();

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

/**
 * Requests are never created here — every DHG record seeds its counterpart with
 * the same Line ID, so this endpoint only lists and updates what already exists.
 */
export default async (request: Request) => {
  const url = new URL(request.url);

  if (request.method === "GET") {
    const date = url.searchParams.get("date");

    if (date) {
      if (!isValidDateKey(date)) return apiError("Invalid record date.", 400);

      const rows = await db
        .select()
        .from(deletionRequests)
        .where(eq(deletionRequests.recordDate, date))
        .orderBy(asc(deletionRequests.lineSequence));

      return Response.json({
        records: await withImages(rows),
        nextLineId: await nextLineId(db, date),
      });
    }
  }

  if (request.method === "PUT") {
    const form = await request.formData().catch(() => null);
    if (!form) return apiError("Expected a multipart form submission.", 400);

    const input = validateRequestInput(form);
    const intents = readSlotIntents(form);
    if (!input || !intents) return apiError("Missing or invalid record data.", 400);

    const id = parseId(url.searchParams.get("id"));
    if (!id) return apiError("Invalid record id.", 400);

    const existing = await loadImages([id]);
    const replacedSlots = intents
      .filter((intent) => intent.action !== "keep")
      .map((intent) => intent.slot);
    const droppedBlobs = existing
      .filter((image) => replacedSlots.includes(image.slot))
      .map((image) => image.blobKey);

    const uploaded = await uploadImages(intents);

    try {
      const record = await db.transaction(async (transaction) => {
        const [updated] = await transaction
          .update(deletionRequests)
          .set({ ...input, updatedAt: new Date() })
          .where(eq(deletionRequests.id, id))
          .returning();

        if (!updated) return null;

        if (replacedSlots.length > 0) {
          await transaction
            .delete(deletionRequestImages)
            .where(
              and(
                eq(deletionRequestImages.requestId, id),
                inArray(deletionRequestImages.slot, replacedSlots),
              ),
            );
        }

        if (uploaded.length > 0) {
          await transaction
            .insert(deletionRequestImages)
            .values(uploaded.map((image) => ({ ...image, requestId: id })));
        }

        return updated;
      });

      if (!record) {
        await discardBlobs(uploaded.map((image) => image.blobKey));
        return apiError("Record not found.", 404);
      }

      await discardBlobs(droppedBlobs);
      const [withImageMeta] = await withImages([record]);
      return Response.json({ record: withImageMeta });
    } catch (error) {
      await discardBlobs(uploaded.map((image) => image.blobKey));
      throw error;
    }
  }

  return new Response("Method not allowed", {
    status: 405,
    headers: { Allow: "GET, PUT" },
  });
};

export const config = {
  path: "/api/deletion-requests",
};
