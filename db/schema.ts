import { date, index, pgTable, serial, timestamp } from "drizzle-orm/pg-core";

export const dhgRecords = pgTable(
  "dhg_records",
  {
    id: serial().primaryKey(),
    recordDate: date("record_date").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("dhg_records_record_date_idx").on(table.recordDate)],
);
