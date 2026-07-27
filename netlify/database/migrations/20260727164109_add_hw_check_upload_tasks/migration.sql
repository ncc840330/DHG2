CREATE TABLE "hw_check_line_images" (
	"id" serial PRIMARY KEY,
	"line_id" integer NOT NULL,
	"slot" integer NOT NULL,
	"blob_key" text NOT NULL,
	"content_type" text NOT NULL,
	"file_name" text NOT NULL,
	"byte_size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hw_check_task_lines" (
	"id" serial PRIMARY KEY,
	"task_id" integer NOT NULL,
	"row_index" integer NOT NULL,
	"item" text NOT NULL,
	"sn" text NOT NULL,
	"qty" text NOT NULL,
	"warehouse_code" text NOT NULL,
	"subinv_code" text NOT NULL,
	"locator" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hw_check_upload_tasks" (
	"id" serial PRIMARY KEY,
	"record_date" date NOT NULL,
	"task_type" text NOT NULL,
	"task_sequence" integer NOT NULL,
	"task_code" text NOT NULL,
	"source_file_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "hw_check_line_images_line_id_idx" ON "hw_check_line_images" ("line_id");--> statement-breakpoint
CREATE UNIQUE INDEX "hw_check_line_images_line_slot_idx" ON "hw_check_line_images" ("line_id","slot");--> statement-breakpoint
CREATE INDEX "hw_check_task_lines_task_id_idx" ON "hw_check_task_lines" ("task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "hw_check_task_lines_task_row_idx" ON "hw_check_task_lines" ("task_id","row_index");--> statement-breakpoint
CREATE INDEX "hw_check_upload_tasks_record_date_idx" ON "hw_check_upload_tasks" ("record_date");--> statement-breakpoint
CREATE UNIQUE INDEX "hw_check_upload_tasks_task_code_idx" ON "hw_check_upload_tasks" ("task_code");--> statement-breakpoint
CREATE UNIQUE INDEX "hw_check_upload_tasks_type_sequence_idx" ON "hw_check_upload_tasks" ("record_date","task_type","task_sequence");--> statement-breakpoint
ALTER TABLE "hw_check_line_images" ADD CONSTRAINT "hw_check_line_images_line_id_hw_check_task_lines_id_fkey" FOREIGN KEY ("line_id") REFERENCES "hw_check_task_lines"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "hw_check_task_lines" ADD CONSTRAINT "hw_check_task_lines_task_id_hw_check_upload_tasks_id_fkey" FOREIGN KEY ("task_id") REFERENCES "hw_check_upload_tasks"("id") ON DELETE CASCADE;