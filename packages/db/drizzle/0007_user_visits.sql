CREATE TABLE "user_visits" (
	"login" text PRIMARY KEY NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"visit_started_at" timestamp with time zone NOT NULL,
	"previous_visit_at" timestamp with time zone
);
