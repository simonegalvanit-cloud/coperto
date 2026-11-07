CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid,
	"restaurant_name" text NOT NULL,
	"stripe_invoice_id" text NOT NULL,
	"number" text DEFAULT '' NOT NULL,
	"status" text NOT NULL,
	"plan" text DEFAULT '' NOT NULL,
	"interval" text DEFAULT '' NOT NULL,
	"amount_net" integer NOT NULL,
	"amount_tax" integer NOT NULL,
	"amount_total" integer NOT NULL,
	"currency" text DEFAULT 'eur' NOT NULL,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"invoice_url" text DEFAULT '' NOT NULL,
	"billing_name" text DEFAULT '' NOT NULL,
	"billing_vat" text DEFAULT '' NOT NULL,
	"billing_tax_code" text DEFAULT '' NOT NULL,
	"billing_address" text DEFAULT '' NOT NULL,
	"billing_sdi" text DEFAULT '' NOT NULL,
	"billing_pec" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_stripe_invoice_id_unique" UNIQUE("stripe_invoice_id")
);
--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "trial_ends_at" timestamp with time zone DEFAULT now() + interval '14 days' NOT NULL;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "plan" text;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "billing_interval" text;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "subscription_status" text;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "stripe_subscription_id" text;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "current_period_end" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "cancel_at_period_end" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "comp_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "comp_note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "trial_reminder_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "trial_ended_notice_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "billing_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "billing_vat" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "billing_tax_code" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "billing_address" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "billing_sdi" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "billing_pec" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payments_created_idx" ON "payments" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "payments_restaurant_idx" ON "payments" USING btree ("restaurant_id");--> statement-breakpoint
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_stripe_customer_id_unique" UNIQUE("stripe_customer_id");