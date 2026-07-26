CREATE TABLE "dhg_record_images" (
	"id" serial PRIMARY KEY,
	"record_id" integer NOT NULL,
	"slot" integer NOT NULL,
	"blob_key" text NOT NULL,
	"content_type" text NOT NULL,
	"file_name" text NOT NULL,
	"byte_size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "dhg_record_images_record_id_idx" ON "dhg_record_images" ("record_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dhg_record_images_record_slot_idx" ON "dhg_record_images" ("record_id","slot");--> statement-breakpoint
ALTER TABLE "dhg_record_images" ADD CONSTRAINT "dhg_record_images_record_id_dhg_records_id_fkey" FOREIGN KEY ("record_id") REFERENCES "dhg_records"("id") ON DELETE CASCADE;