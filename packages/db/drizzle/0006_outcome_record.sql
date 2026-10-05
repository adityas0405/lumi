ALTER TABLE "tasks" ADD COLUMN "revert_of" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "head_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_revert_of_tasks_id_fk" FOREIGN KEY ("revert_of") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
UPDATE "tasks" SET "head_changed_at" = "created_at" WHERE "head_changed_at" IS NULL;--> statement-breakpoint
DELETE FROM "outcomes" o USING "outcomes" d WHERE o."task_id" = d."task_id" AND o."kind" = d."kind" AND o."ref" IS NOT DISTINCT FROM d."ref" AND o."id" > d."id";--> statement-breakpoint
ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_task_kind_ref" UNIQUE NULLS NOT DISTINCT("task_id","kind","ref");