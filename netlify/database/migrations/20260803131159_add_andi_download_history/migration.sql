CREATE TABLE "andi_downloads" (
	"id" serial PRIMARY KEY,
	"record_date" date NOT NULL,
	"format" text NOT NULL,
	"file_name" text NOT NULL,
	"photo_ids" text NOT NULL,
	"photo_count" integer NOT NULL,
	"byte_size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "andi_downloads_created_at_idx" ON "andi_downloads" ("created_at");