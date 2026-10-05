ALTER TABLE "repos" ALTER COLUMN "github_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "deploys" ADD COLUMN "pr_numbers" jsonb DEFAULT '[]'::jsonb NOT NULL;