import {
  date,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const dhgRecords = pgTable(
  "dhg_records",
  {
    id: serial().primaryKey(),
    recordDate: date("record_date").notNull(),
    lineSequence: integer("line_sequence").notNull(),
    lineId: text("line_id").notNull(),
    systemItem: text("system_item").notNull(),
    systemSn: text("system_sn").notNull(),
    physicalItem: text("physical_item").notNull(),
    physicalSn: text("physical_sn").notNull(),
    rfid: text().notNull(),
    problemDescription: text("problem_description").notNull(),
    problemOther: text("problem_other"),
    locator: text().notNull(),
    county: text().notNull(),
    sourceTaskId: text("source_task_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("dhg_records_record_date_idx").on(table.recordDate),
    uniqueIndex("dhg_records_line_id_idx").on(table.lineId),
    uniqueIndex("dhg_records_date_sequence_idx").on(
      table.recordDate,
      table.lineSequence,
    ),
  ],
);

export const dhgRecordImages = pgTable(
  "dhg_record_images",
  {
    id: serial().primaryKey(),
    recordId: integer("record_id")
      .notNull()
      .references(() => dhgRecords.id, { onDelete: "cascade" }),
    slot: integer().notNull(),
    blobKey: text("blob_key").notNull(),
    contentType: text("content_type").notNull(),
    fileName: text("file_name").notNull(),
    byteSize: integer("byte_size").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("dhg_record_images_record_id_idx").on(table.recordId),
    uniqueIndex("dhg_record_images_record_slot_idx").on(table.recordId, table.slot),
  ],
);

export const deletionRequests = pgTable(
  "deletion_requests",
  {
    id: serial().primaryKey(),
    recordDate: date("record_date").notNull(),
    lineSequence: integer("line_sequence").notNull(),
    lineId: text("line_id").notNull(),
    sourceTaskId: text("source_task_id").notNull(),
    systemItem: text("system_item").notNull(),
    systemSn: text("system_sn").notNull(),
    rfid: text().notNull(),
    problemDescription: text("problem_description").notNull(),
    problemOther: text("problem_other"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("deletion_requests_record_date_idx").on(table.recordDate),
    index("deletion_requests_source_task_id_idx").on(table.sourceTaskId),
    uniqueIndex("deletion_requests_line_id_idx").on(table.lineId),
    uniqueIndex("deletion_requests_date_sequence_idx").on(
      table.recordDate,
      table.lineSequence,
    ),
  ],
);

export const deletionRequestImages = pgTable(
  "deletion_request_images",
  {
    id: serial().primaryKey(),
    requestId: integer("request_id")
      .notNull()
      .references(() => deletionRequests.id, { onDelete: "cascade" }),
    slot: integer().notNull(),
    blobKey: text("blob_key").notNull(),
    contentType: text("content_type").notNull(),
    fileName: text("file_name").notNull(),
    byteSize: integer("byte_size").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("deletion_request_images_request_id_idx").on(table.requestId),
    uniqueIndex("deletion_request_images_request_slot_idx").on(
      table.requestId,
      table.slot,
    ),
  ],
);
