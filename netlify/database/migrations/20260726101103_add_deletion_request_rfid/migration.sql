ALTER TABLE "deletion_requests" ADD COLUMN "rfid" text;--> statement-breakpoint
UPDATE "deletion_requests" SET "rfid" = 'Not available' WHERE "rfid" IS NULL;--> statement-breakpoint
ALTER TABLE "deletion_requests" ALTER COLUMN "rfid" SET NOT NULL;
