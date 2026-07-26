CREATE TABLE "deletion_request_images" (
	"id" serial PRIMARY KEY,
	"request_id" integer NOT NULL,
	"slot" integer NOT NULL,
	"blob_key" text NOT NULL,
	"content_type" text NOT NULL,
	"file_name" text NOT NULL,
	"byte_size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deletion_requests" (
	"id" serial PRIMARY KEY,
	"record_date" date NOT NULL,
	"line_sequence" integer NOT NULL,
	"line_id" text NOT NULL,
	"source_task_id" text NOT NULL,
	"system_item" text NOT NULL,
	"system_sn" text NOT NULL,
	"problem_description" text NOT NULL,
	"problem_other" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "deletion_request_images_request_id_idx" ON "deletion_request_images" ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "deletion_request_images_request_slot_idx" ON "deletion_request_images" ("request_id","slot");--> statement-breakpoint
CREATE INDEX "deletion_requests_record_date_idx" ON "deletion_requests" ("record_date");--> statement-breakpoint
CREATE INDEX "deletion_requests_source_task_id_idx" ON "deletion_requests" ("source_task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "deletion_requests_line_id_idx" ON "deletion_requests" ("line_id");--> statement-breakpoint
CREATE UNIQUE INDEX "deletion_requests_date_sequence_idx" ON "deletion_requests" ("record_date","line_sequence");--> statement-breakpoint
ALTER TABLE "deletion_request_images" ADD CONSTRAINT "deletion_request_images_request_id_deletion_requests_id_fkey" FOREIGN KEY ("request_id") REFERENCES "deletion_requests"("id") ON DELETE CASCADE;