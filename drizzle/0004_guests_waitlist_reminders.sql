CREATE TYPE "public"."waitlist_source" AS ENUM('door', 'online');--> statement-breakpoint
CREATE TYPE "public"."waitlist_status" AS ENUM('waiting', 'notified', 'seated', 'left');--> statement-breakpoint
CREATE TABLE "guests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"allergies" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"vip" boolean DEFAULT false NOT NULL,
	"birthday" text DEFAULT '' NOT NULL,
	"anniversary" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waitlist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"date" date NOT NULL,
	"name" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"party_size" integer NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"source" "waitlist_source" NOT NULL,
	"status" "waitlist_status" DEFAULT 'waiting' NOT NULL,
	"notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "guest_id" uuid;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "reminder_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "guest_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "reminders_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "guests" ADD CONSTRAINT "guests_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist" ADD CONSTRAINT "waitlist_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "guests_restaurant_idx" ON "guests" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX "guests_phone_idx" ON "guests" USING btree ("restaurant_id","phone");--> statement-breakpoint
CREATE INDEX "guests_email_idx" ON "guests" USING btree ("restaurant_id","email");--> statement-breakpoint
CREATE INDEX "waitlist_restaurant_date_idx" ON "waitlist" USING btree ("restaurant_id","date");--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE set null ON UPDATE no action;