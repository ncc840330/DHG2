CREATE TABLE "andi_photos" (
	"id" serial PRIMARY KEY,
	"record_date" date NOT NULL,
	"file_name" text NOT NULL,
	"blob_key" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "andi_photos_record_date_idx" ON "andi_photos" ("record_date");