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
    // The form no longer collects a county. The column stays so records saved
    // while it was a required field still export their value.
    county: text(),
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

/**
 * Legacy hardware check requests, one typed-in line each. The worksheet now
 * creates tasks from an imported spreadsheet instead (see hwCheckUploadTasks),
 * so nothing writes here any more — the table stays for the lines already saved.
 */
export const hwCheckTasks = pgTable(
  "hw_check_tasks",
  {
    id: serial().primaryKey(),
    recordDate: date("record_date").notNull(),
    lineSequence: integer("line_sequence").notNull(),
    lineId: text("line_id").notNull(),
    sourceTaskId: text("source_task_id").notNull(),
    systemItem: text("system_item").notNull(),
    systemSn: text("system_sn").notNull(),
    rfid: text().notNull(),
    locator: text().notNull(),
    problemDescription: text("problem_description").notNull(),
    problemOther: text("problem_other"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("hw_check_tasks_record_date_idx").on(table.recordDate),
    index("hw_check_tasks_source_task_id_idx").on(table.sourceTaskId),
    uniqueIndex("hw_check_tasks_line_id_idx").on(table.lineId),
    uniqueIndex("hw_check_tasks_date_sequence_idx").on(
      table.recordDate,
      table.lineSequence,
    ),
  ],
);

export const hwCheckTaskImages = pgTable(
  "hw_check_task_images",
  {
    id: serial().primaryKey(),
    taskId: integer("task_id")
      .notNull()
      .references(() => hwCheckTasks.id, { onDelete: "cascade" }),
    slot: integer().notNull(),
    blobKey: text("blob_key").notNull(),
    contentType: text("content_type").notNull(),
    fileName: text("file_name").notNull(),
    byteSize: integer("byte_size").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("hw_check_task_images_task_id_idx").on(table.taskId),
    uniqueIndex("hw_check_task_images_task_slot_idx").on(table.taskId, table.slot),
  ],
);

/**
 * One hardware check task per imported spreadsheet. The task type decides what
 * the operator has to do with the lines and how the task is numbered, e.g.
 * `Photo.20260727.01` for the photo upload work.
 */
export const hwCheckUploadTasks = pgTable(
  "hw_check_upload_tasks",
  {
    id: serial().primaryKey(),
    recordDate: date("record_date").notNull(),
    taskType: text("task_type").notNull(),
    taskSequence: integer("task_sequence").notNull(),
    taskCode: text("task_code").notNull(),
    sourceFileName: text("source_file_name").notNull(),
    // The yellow seal sheet names who checks and who confirms once, at the top
    // of the file. Both are kept on the task because every printed row repeats
    // them, and the signature column is left for a pen.
    checkedBy: text("checked_by").default("").notNull(),
    confirmedBy: text("confirmed_by").default("").notNull(),
    signature: text().default("").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("hw_check_upload_tasks_record_date_idx").on(table.recordDate),
    uniqueIndex("hw_check_upload_tasks_task_code_idx").on(table.taskCode),
    uniqueIndex("hw_check_upload_tasks_type_sequence_idx").on(
      table.recordDate,
      table.taskType,
      table.taskSequence,
    ),
  ],
);

/**
 * One workable piece of a task: for photo upload a spreadsheet row of qty 3
 * becomes three lines, each numbered with the piece it stands for, and for the
 * yellow seal check every row is one box whose seal gets a pass or a fail.
 */
export const hwCheckTaskLines = pgTable(
  "hw_check_task_lines",
  {
    id: serial().primaryKey(),
    taskId: integer("task_id")
      .notNull()
      .references(() => hwCheckUploadTasks.id, { onDelete: "cascade" }),
    rowIndex: integer("row_index").notNull(),
    item: text().notNull(),
    sn: text().notNull(),
    qty: text().notNull(),
    unitIndex: integer("unit_index").default(1).notNull(),
    unitCount: integer("unit_count").default(1).notNull(),
    warehouseCode: text("warehouse_code").notNull(),
    subinvCode: text("subinv_code").notNull(),
    locator: text().notNull(),
    /** Yellow seal work reads the label off the box, so the code travels along. */
    barcode: text().default("").notNull(),
    /** `pass`, `fail` or empty while the seal has not been looked at yet. */
    sealResult: text("seal_result").default("").notNull(),
    /** Free text from whoever checked the seal. Never required. */
    remark: text().default("").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("hw_check_task_lines_task_id_idx").on(table.taskId),
    uniqueIndex("hw_check_task_lines_task_row_idx").on(table.taskId, table.rowIndex),
  ],
);

/** Two photos per line; the line counts as done once both slots are filled. */
export const hwCheckLineImages = pgTable(
  "hw_check_line_images",
  {
    id: serial().primaryKey(),
    lineId: integer("line_id")
      .notNull()
      .references(() => hwCheckTaskLines.id, { onDelete: "cascade" }),
    slot: integer().notNull(),
    blobKey: text("blob_key").notNull(),
    contentType: text("content_type").notNull(),
    fileName: text("file_name").notNull(),
    byteSize: integer("byte_size").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("hw_check_line_images_line_id_idx").on(table.lineId),
    uniqueIndex("hw_check_line_images_line_slot_idx").on(table.lineId, table.slot),
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

/**
 * The Andi import/export gallery: pictures that belong to a work day and to
 * nothing else. There is no task, no line and no slot — a photo is imported to
 * be handed back out again, one JPEG at a time or the day's lot in a ZIP — so
 * the only things kept are the day it was filed under and the name it is to be
 * downloaded as.
 */
export const andiPhotos = pgTable(
  "andi_photos",
  {
    id: serial().primaryKey(),
    recordDate: date("record_date").notNull(),
    /** The download name, extension included. Renamed as often as they like. */
    fileName: text("file_name").notNull(),
    blobKey: text("blob_key").notNull(),
    contentType: text("content_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("andi_photos_record_date_idx").on(table.recordDate)],
);
