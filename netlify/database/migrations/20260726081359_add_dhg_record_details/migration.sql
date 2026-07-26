ALTER TABLE "dhg_records" ADD COLUMN "line_sequence" integer;--> statement-breakpoint
ALTER TABLE "dhg_records" ADD COLUMN "line_id" text;--> statement-breakpoint
ALTER TABLE "dhg_records" ADD COLUMN "system_item" text;--> statement-breakpoint
ALTER TABLE "dhg_records" ADD COLUMN "system_sn" text;--> statement-breakpoint
ALTER TABLE "dhg_records" ADD COLUMN "physical_item" text;--> statement-breakpoint
ALTER TABLE "dhg_records" ADD COLUMN "physical_sn" text;--> statement-breakpoint
ALTER TABLE "dhg_records" ADD COLUMN "rfid" text;--> statement-breakpoint
ALTER TABLE "dhg_records" ADD COLUMN "problem_description" text;--> statement-breakpoint
ALTER TABLE "dhg_records" ADD COLUMN "problem_other" text;--> statement-breakpoint
ALTER TABLE "dhg_records" ADD COLUMN "locator" text;--> statement-breakpoint
ALTER TABLE "dhg_records" ADD COLUMN "county" text;--> statement-breakpoint
ALTER TABLE "dhg_records" ADD COLUMN "source_task_id" text;--> statement-breakpoint
ALTER TABLE "dhg_records" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
WITH numbered_records AS (
	SELECT "id", row_number() OVER (PARTITION BY "record_date" ORDER BY "id")::integer AS "sequence"
	FROM "dhg_records"
)
UPDATE "dhg_records" AS records
SET
	"line_sequence" = numbered_records."sequence",
	"line_id" = replace(records."record_date"::text, '-', '') || '-' || lpad(numbered_records."sequence"::text, 3, '0'),
	"system_item" = 'Not available',
	"system_sn" = 'Not available',
	"physical_item" = 'Not available',
	"physical_sn" = 'Not available',
	"rfid" = 'Not available',
	"problem_description" = 'Other',
	"problem_other" = 'Legacy record',
	"locator" = 'Not available',
	"county" = 'Not available',
	"source_task_id" = 'Not available'
FROM numbered_records
WHERE records."id" = numbered_records."id";--> statement-breakpoint
ALTER TABLE "dhg_records" ALTER COLUMN "line_sequence" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "dhg_records" ALTER COLUMN "line_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "dhg_records" ALTER COLUMN "system_item" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "dhg_records" ALTER COLUMN "system_sn" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "dhg_records" ALTER COLUMN "physical_item" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "dhg_records" ALTER COLUMN "physical_sn" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "dhg_records" ALTER COLUMN "rfid" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "dhg_records" ALTER COLUMN "problem_description" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "dhg_records" ALTER COLUMN "locator" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "dhg_records" ALTER COLUMN "county" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "dhg_records" ALTER COLUMN "source_task_id" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "dhg_records_line_id_idx" ON "dhg_records" ("line_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dhg_records_date_sequence_idx" ON "dhg_records" ("record_date","line_sequence");
