CREATE TABLE "job_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"role" text NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"link" text DEFAULT '' NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"cv_name" text NOT NULL,
	"cv_type" text NOT NULL,
	"cv" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
