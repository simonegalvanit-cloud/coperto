CREATE TYPE "public"."consent_action" AS ENUM('granted', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."consent_kind" AS ENUM('profile', 'marketing');--> statement-breakpoint
CREATE TYPE "public"."consent_source" AS ENUM('online', 'staff', 'guest_link');--> statement-breakpoint
CREATE TABLE "consent_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guest_id" uuid NOT NULL,
	"kind" "consent_kind" NOT NULL,
	"action" "consent_action" NOT NULL,
	"source" "consent_source" NOT NULL,
	"wording" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guest_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"guest_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "guests" ADD COLUMN "profile_consent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "guests" ADD COLUMN "profile_consent_source" "consent_source";--> statement-breakpoint
ALTER TABLE "guests" ADD COLUMN "marketing_consent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "consent_log" ADD CONSTRAINT "consent_log_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_tokens" ADD CONSTRAINT "guest_tokens_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consent_log_guest_idx" ON "consent_log" USING btree ("guest_id");