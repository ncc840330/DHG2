ALTER TABLE "hw_check_task_lines" ADD COLUMN "unit_index" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "hw_check_task_lines" ADD COLUMN "unit_count" integer DEFAULT 1 NOT NULL;