CREATE TABLE "agents" (
	"key" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"voice_id" text,
	"model_family" text NOT NULL,
	"paused_at" timestamp with time zone,
	"paused_by" text
);
--> statement-breakpoint
CREATE TABLE "decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"feedback" text,
	"decided_by" text NOT NULL,
	"github_review_id" text,
	"delivered_at" timestamp with time zone,
	"delivery_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deploys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repo_id" uuid NOT NULL,
	"github_deployment_id" integer,
	"environment" text NOT NULL,
	"sha" text NOT NULL,
	"previous_sha" text,
	"status" text NOT NULL,
	"environment_url" text,
	"task_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"deployed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "deploys_github_deployment_id_unique" UNIQUE("github_deployment_id")
);
--> statement-breakpoint
CREATE TABLE "digests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repo_id" uuid NOT NULL,
	"day" text NOT NULL,
	"counts" jsonb NOT NULL,
	"slack_ts" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"ref" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"payload" jsonb NOT NULL,
	"blob_path" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repo_id" uuid,
	"source" text NOT NULL,
	"severity" text NOT NULL,
	"title" text NOT NULL,
	"service" text,
	"environment" text,
	"stats" jsonb NOT NULL,
	"frames" jsonb NOT NULL,
	"deploy_id" uuid,
	"suspects" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"slack_ts" text,
	"status" text DEFAULT 'open' NOT NULL,
	"actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"model" text NOT NULL,
	"purpose" text NOT NULL,
	"response" jsonb NOT NULL,
	"usage" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outcomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"detail" text,
	"ref" text,
	"occurred_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"question" text NOT NULL,
	"answer" jsonb,
	"not_in_evidence" boolean DEFAULT false NOT NULL,
	"asked_by" text NOT NULL,
	"video_time_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "renders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"script_id" uuid,
	"status" text NOT NULL,
	"progress" real DEFAULT 0 NOT NULL,
	"video_path" text,
	"poster_path" text,
	"timeline" jsonb,
	"captions_vtt" text,
	"duration_ms" integer,
	"error" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"github_id" integer NOT NULL,
	"full_name" text NOT NULL,
	"installation_id" integer,
	"default_branch" text DEFAULT 'main' NOT NULL,
	"settings" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "repos_github_id_unique" UNIQUE("github_id"),
	CONSTRAINT "repos_full_name_unique" UNIQUE("full_name")
);
--> statement-breakpoint
CREATE TABLE "scripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"body" jsonb NOT NULL,
	"validation" jsonb NOT NULL,
	"attempts" integer NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repo_id" uuid NOT NULL,
	"agent" text NOT NULL,
	"agent_detection" text NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"pr_number" integer,
	"pr_url" text,
	"title" text NOT NULL,
	"branch" text,
	"base_sha" text,
	"head_sha" text,
	"author_login" text,
	"agent_claim" text DEFAULT '' NOT NULL,
	"labels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pr_state" text DEFAULT 'open' NOT NULL,
	"status" text DEFAULT 'ingesting' NOT NULL,
	"status_detail" text,
	"progress" real DEFAULT 0 NOT NULL,
	"additions" integer DEFAULT 0 NOT NULL,
	"deletions" integer DEFAULT 0 NOT NULL,
	"files" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"secret_findings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"planted_error" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"merged_at" timestamp with time zone,
	"merge_commit_sha" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "triage_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"route" text NOT NULL,
	"would_auto_pass" boolean NOT NULL,
	"score" real NOT NULL,
	"signals" jsonb NOT NULL,
	"reasons" jsonb NOT NULL,
	"suspected_defects" jsonb NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tts_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"audio_path" text NOT NULL,
	"alignment" jsonb NOT NULL,
	"duration_ms" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"event" text NOT NULL,
	"payload" jsonb NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deploys" ADD CONSTRAINT "deploys_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digests" ADD CONSTRAINT "digests_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_deploy_id_deploys_id_fk" FOREIGN KEY ("deploy_id") REFERENCES "public"."deploys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renders" ADD CONSTRAINT "renders_script_id_scripts_id_fk" FOREIGN KEY ("script_id") REFERENCES "public"."scripts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "triage_results" ADD CONSTRAINT "triage_results_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "evidence_task_ref" ON "evidence" USING btree ("task_id","ref");--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_external_id" ON "tasks" USING btree ("external_id");--> statement-breakpoint
CREATE INDEX "tasks_repo_occurred" ON "tasks" USING btree ("repo_id","occurred_at");--> statement-breakpoint
CREATE INDEX "tasks_status" ON "tasks" USING btree ("status");