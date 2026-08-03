ALTER TABLE "hw_check_task_lines" ADD COLUMN "barcode" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "hw_check_task_lines" ADD COLUMN "seal_result" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "hw_check_task_lines" ADD COLUMN "remark" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "hw_check_upload_tasks" ADD COLUMN "checked_by" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "hw_check_upload_tasks" ADD COLUMN "confirmed_by" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "hw_check_upload_tasks" ADD COLUMN "signature" text DEFAULT '' NOT NULL;