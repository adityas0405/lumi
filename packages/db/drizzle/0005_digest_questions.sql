ALTER TABLE "questions" ALTER COLUMN "task_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "digest_id" uuid;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_digest_id_digests_id_fk" FOREIGN KEY ("digest_id") REFERENCES "public"."digests"("id") ON DELETE cascade ON UPDATE no action;