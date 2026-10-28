CREATE TABLE "combination_tables" (
	"combination_id" uuid NOT NULL,
	"table_id" uuid NOT NULL,
	CONSTRAINT "combination_tables_combination_id_table_id_pk" PRIMARY KEY("combination_id","table_id")
);
--> statement-breakpoint
CREATE TABLE "table_combinations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"min_covers" integer NOT NULL,
	"max_covers" integer NOT NULL,
	"bookable_online" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zone_closures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"zone_name" text NOT NULL,
	"date" date NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dining_tables" ADD COLUMN "rotation" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "fixtures" ADD COLUMN "rotation" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "combination_id" uuid;--> statement-breakpoint
ALTER TABLE "combination_tables" ADD CONSTRAINT "combination_tables_combination_id_table_combinations_id_fk" FOREIGN KEY ("combination_id") REFERENCES "public"."table_combinations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "combination_tables" ADD CONSTRAINT "combination_tables_table_id_dining_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."dining_tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_combinations" ADD CONSTRAINT "table_combinations_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone_closures" ADD CONSTRAINT "zone_closures_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "table_combinations_restaurant_idx" ON "table_combinations" USING btree ("restaurant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "zone_closures_unique_idx" ON "zone_closures" USING btree ("restaurant_id","zone_name","date");--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_combination_id_table_combinations_id_fk" FOREIGN KEY ("combination_id") REFERENCES "public"."table_combinations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reservations_restaurant_updated_idx" ON "reservations" USING btree ("restaurant_id","updated_at");