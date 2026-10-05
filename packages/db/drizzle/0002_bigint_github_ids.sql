ALTER TABLE "deploys" ALTER COLUMN "github_deployment_id" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "repos" ALTER COLUMN "github_id" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "repos" ALTER COLUMN "installation_id" SET DATA TYPE bigint;