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
