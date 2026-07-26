CREATE TABLE "dhg_records" (
	"id" serial PRIMARY KEY,
	"record_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "dhg_records_record_date_idx" ON "dhg_records" ("record_date");