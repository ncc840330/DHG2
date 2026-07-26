import { asc, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { deletionRequests, dhgRecords } from "../../db/schema.js";
import { firstFreeSequence, makeLineId } from "./records.js";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type Executor = typeof db | Transaction;

/**
 * DHG records and deletion requests share a single Line ID pool: a request is
 * always the counterpart of a record, so both are numbered from the same
 * sequence and the same date lock guards every hand-out.
 */
export function lineIdLockKey(recordDate: string) {
  return `line-id:${recordDate}`;
}

export async function usedLineSequences(executor: Executor, recordDate: string) {
  const records = await executor
    .select({ sequence: dhgRecords.lineSequence })
    .from(dhgRecords)
    .where(eq(dhgRecords.recordDate, recordDate))
    .orderBy(asc(dhgRecords.lineSequence));

  const requests = await executor
    .select({ sequence: deletionRequests.lineSequence })
    .from(deletionRequests)
    .where(eq(deletionRequests.recordDate, recordDate))
    .orderBy(asc(deletionRequests.lineSequence));

  const sequences = Array.from(
    new Set([...records, ...requests].map((row) => row.sequence)),
  ).sort((left, right) => left - right);

  return sequences.map((sequence) => ({ sequence }));
}

export async function nextLineSequence(executor: Executor, recordDate: string) {
  return firstFreeSequence(await usedLineSequences(executor, recordDate));
}

export async function nextLineId(executor: Executor, recordDate: string) {
  return makeLineId(recordDate, await nextLineSequence(executor, recordDate));
}
