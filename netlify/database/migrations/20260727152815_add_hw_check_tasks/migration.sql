CREATE TABLE "hw_check_task_images" (
	"id" serial PRIMARY KEY,
	"task_id" integer NOT NULL,
	"slot" integer NOT NULL,
	"blob_key" text NOT NULL,
	"content_type" text NOT NULL,
	"file_name" text NOT NULL,
	"byte_size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hw_check_tasks" (
	"id" serial PRIMARY KEY,
	"record_date" date NOT NULL,
	"line_sequence" integer NOT NULL,
	"line_id" text NOT NULL,
	"source_task_id" text NOT NULL,
	"system_item" text NOT NULL,
	"system_sn" text NOT NULL,
	"rfid" text NOT NULL,
	"locator" text NOT NULL,
	"problem_description" text NOT NULL,
	"problem_other" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "hw_check_task_images_task_id_idx" ON "hw_check_task_images" ("task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "hw_check_task_images_task_slot_idx" ON "hw_check_task_images" ("task_id","slot");--> statement-breakpoint
CREATE INDEX "hw_check_tasks_record_date_idx" ON "hw_check_tasks" ("record_date");--> statement-breakpoint
CREATE INDEX "hw_check_tasks_source_task_id_idx" ON "hw_check_tasks" ("source_task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "hw_check_tasks_line_id_idx" ON "hw_check_tasks" ("line_id");--> statement-breakpoint
CREATE UNIQUE INDEX "hw_check_tasks_date_sequence_idx" ON "hw_check_tasks" ("record_date","line_sequence");--> statement-breakpoint
ALTER TABLE "hw_check_task_images" ADD CONSTRAINT "hw_check_task_images_task_id_hw_check_tasks_id_fkey" FOREIGN KEY ("task_id") REFERENCES "hw_check_tasks"("id") ON DELETE CASCADE;